// 홈페이지(irowoon.com/check) 지원금 무료 조회 고객 → 회사 전산 '지원금 영업' 1차 목록.
// 홈페이지는 이 서버에만 보내고, 이 서버가 CRM_APP_PROFILE_SECRET 으로 서명해 전산에 넘긴다(키는 브라우저에 없다).
// 보낼 내용은 먼저 DB 대기열에 저장하고, 전산이 받을 때까지 1분마다 다시 보낸다. 번호·이름은 로그에 남기지 않는다.
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const PATH = "/api/integration/check-leads";
let ready: Promise<unknown> | undefined;
export const ensureCheckLeadTable = () => (ready ??= pool.query(`CREATE TABLE IF NOT EXISTS iroun_check_lead_outbox(
  id uuid PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, last_error text NOT NULL DEFAULT '')`));

/** 홈페이지 선택지 → 숫자(구간 가운데 값). 금액은 만 원, 금리는 %. 모르면 0(직원이 통화로 확인). */
export const AMOUNT_MID: Record<string, number> = { "1천만 원 미만": 500, "1천만~3천만 원": 2000, "3천만~5천만 원": 4000, "5천만~1억 원": 7500, "1억~3억 원": 20000, "3억 원 이상": 30000 };
export const RATE_MID: Record<string, number> = { "3% 미만": 2.5, "3~4%": 3.5, "4~5%": 4.5, "5~6%": 5.5, "6~8%": 7, "8~12%": 10, "12% 이상": 14, "잘 모르겠어요": 0 };

const short = (n: number) => z.string().trim().max(n);
export const checkLeadInput = z.object({
  name: short(30).min(1), phone: z.string().trim().regex(/^01[016789]-?\d{3,4}-?\d{4}$/),
  bizName: short(60).optional(), industry: short(30).optional(), province: short(20).optional(), district: short(20).optional(),
  openedYear: z.number().int().min(1950).max(2100).optional(), employeeBand: short(20).optional(), entity: short(10).optional(),
  revNow: short(30).optional(), revLast: short(30).optional(),
  questionnaireVersion: z.literal(2).optional(), revenueYear: z.number().int().min(2020).max(2100).optional(),
  creditBand: z.enum(["750~990점", "700~750점", "600~700점", "600점 미만"]).optional(),
  currentArrears: z.enum(["O", "X"]).optional(), premises: z.enum(["임차", "자가"]).optional(),
  policyFund: z.enum(["O", "X"]).optional(), // 정책자금을 받은 적 있음(O)/없음(X)
  loans: z.array(z.object({ kind: short(30), amountBand: short(40).optional(), rateBand: short(40).optional() })).max(10).default([]),
  supportThisYear: z.number().min(0).max(1e11).optional(), supportLastYear: z.number().min(0).max(1e11).optional(), sureCount: z.number().int().min(0).max(10000).optional(),
  consent: z.literal(true), marketing: z.boolean().optional(),
  // 직원 전용 링크로 들어온 고객: 전산이 발급한 추천 식별자(로그인 권한·비밀키 아님). 전산이 담당 직원을 정하는 근거로만 쓴다.
  referralToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  // 결과 화면에서 고객이 특정 지원금의 '신청 도움 받기'를 눌렀을 때만 있다. 전산에는 type "check.help_request" 로 간다.
  helpRequest: z.object({
    benefitId: short(120).min(1), title: short(200).min(1), amountText: short(40).optional(), amountWon: z.number().min(0).max(1e11).optional(),
    endsAt: short(40).optional(), agency: short(80).optional(), sourceUrl: z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/).optional(), result: short(20).optional(),
  }).strict().optional(),
}).strict();
export type CheckLeadInput = z.infer<typeof checkLeadInput>;

/** 전산에 보낼 모양. 금액(원) → 만 원, 대출 구간 → 가운데 값 */
export function toCrmLead(x: CheckLeadInput, now = new Date()) {
  const man = (won?: number) => (won && won > 0 ? Math.round(won / 1e4) : null);
  return {
    schemaVersion: 1, type: x.helpRequest ? "check.help_request" : "check.lead", requestId: randomUUID(), occurredAt: now.toISOString(), consentAt: now.toISOString(),
    name: x.name, phone: x.phone.replace(/\D/g, ""), bizName: x.bizName ?? "", industry: x.industry ?? "", province: x.province ?? "", district: x.district ?? "",
    openedYear: x.openedYear ?? null, employeeBand: x.employeeBand ?? "", entity: x.entity ?? "", revNow: x.revNow ?? "", revLast: x.revLast ?? "",
    loans: x.loans.filter((l) => l.kind !== "없음").map((l) => ({ kind: l.kind, amount: AMOUNT_MID[l.amountBand ?? ""] ?? 0, rate: RATE_MID[l.rateBand ?? ""] ?? 0, amountBand: l.amountBand ?? "", rateBand: l.rateBand ?? "" })),
    supportThisYear: man(x.supportThisYear), supportLastYear: man(x.supportLastYear), sureCount: x.sureCount ?? null,
    ...(x.questionnaireVersion ? { questionnaireVersion: x.questionnaireVersion } : {}),
    ...(x.revenueYear !== undefined ? { revenueYear: x.revenueYear } : {}),
    ...(x.creditBand ? { creditBand: x.creditBand } : {}),
    ...(x.currentArrears ? { currentArrears: x.currentArrears } : {}),
    ...(x.policyFund ? { policyFund: x.policyFund } : {}),
    ...(x.premises ? { premises: x.premises } : {}),
    ...(x.referralToken ? { referralToken: x.referralToken } : {}),
    ...(x.helpRequest ? { helpRequest: { ...x.helpRequest, amountMan: x.helpRequest.amountWon ? Math.round(x.helpRequest.amountWon / 1e4) : null } } : {}),
  };
}

export const checkLeadReady = () => !!process.env.CRM_BASE_URL && /^[a-f\d]{64}$/i.test(process.env.CRM_APP_PROFILE_SECRET ?? "");

/** 서명해서 전산에 보낸다. 매번 새 requestId(전산은 같은 requestId 를 두 번 받지 않는다). */
export async function sendToCrm(payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch) {
  const base = new URL(process.env.CRM_BASE_URL!);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.username) throw new Error("CRM_BASE_URL must be an HTTPS origin");
  const raw = JSON.stringify({ ...payload, requestId: randomUUID() });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.CRM_APP_PROFILE_SECRET!).update(`${timestamp}\nPOST\n${PATH}\n${raw}`, "utf8").digest("hex");
  const res = await fetchImpl(new URL(PATH, base), { method: "POST", headers: { "Content-Type": "application/json", "X-Timestamp": timestamp, "X-Signature": signature }, body: raw, signal: AbortSignal.timeout(15000), redirect: "error" });
  const text = await res.text();
  let body: { accepted?: boolean; result?: string; error?: string; message?: string } = {};
  try { body = JSON.parse(text); } catch { /* 비 JSON 응답 */ }
  if (!res.ok || body.accepted !== true) throw Object.assign(new Error(`CRM ${res.status} ${(body.error || body.message || "").slice(0, 120)}`), { status: res.status });
  return body;
}

/** 대기열에 넣고 바로 한 번 보내 본다 */
export async function enqueueCheckLead(x: CheckLeadInput) {
  await ensureCheckLeadTable();
  const id = randomUUID();
  await pool.query("INSERT INTO iroun_check_lead_outbox(id,payload) VALUES($1,$2)", [id, JSON.stringify(toCrmLead(x))]);
  void flushCheckLeads().catch(() => undefined);
  return id;
}

let flushing = false;
/** 보내지 못한 것들을 다시 보낸다. 4xx(형식 오류)는 10번까지, 그 외는 계속 다시 시도(간격을 늘려서). */
export async function flushCheckLeads(fetchImpl: typeof fetch = fetch) {
  if (flushing || !checkLeadReady()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    await ensureCheckLeadTable();
    const { rows } = await pool.query("SELECT id,payload,attempts FROM iroun_check_lead_outbox WHERE sent_at IS NULL AND next_at<=now() AND attempts<50 ORDER BY created_at LIMIT 20");
    for (const r of rows) {
      try {
        const out = await sendToCrm(r.payload, fetchImpl);
        await pool.query("UPDATE iroun_check_lead_outbox SET sent_at=now(),attempts=attempts+1,last_error=$2 WHERE id=$1", [r.id, String(out.result ?? "")]);
        sent++;
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        // 도움 요청은 전산이 아직 받을 준비가 안 됐어도(4xx) 버리지 않고 50번(약 이틀)까지 다시 보낸다.
        const help = r.payload?.type === "check.help_request";
        const giveUp = !help && status >= 400 && status < 500 && status !== 409 && status !== 429 && r.attempts + 1 >= 10;
        const wait = Math.min(60, 2 ** Math.min(r.attempts, 6)); // 분
        await pool.query("UPDATE iroun_check_lead_outbox SET attempts=$2,next_at=now()+($3||' minutes')::interval,last_error=$4 WHERE id=$1", [r.id, giveUp ? 50 : r.attempts + 1, String(wait), (e as Error).message.slice(0, 200)]);
        failed++;
      }
    }
  } finally { flushing = false; }
  if (failed) logger.warn({ sent, failed }, "홈페이지 조회 고객 전산 전달 일부 실패(다시 시도함)");
  return { sent, failed };
}
export async function checkLeadStatus() {
  await ensureCheckLeadTable();
  const { rows: [s] } = await pool.query("SELECT count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent, count(*) FILTER (WHERE sent_at IS NULL AND attempts<50)::int AS pending, count(*) FILTER (WHERE sent_at IS NULL AND attempts>=50)::int AS failed, max(sent_at) AS last_sent, (SELECT last_error FROM iroun_check_lead_outbox WHERE sent_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_error FROM iroun_check_lead_outbox");
  return { ready: checkLeadReady(), ...s };
}
