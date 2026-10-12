/**
 * 정책자금 진단 요청: 고객이 고른 조건을 회사 담당자에게 전달한다.
 * 앱은 한도·금리를 계산하지 않는다. 담당자가 전화로 안내한다.
 * 신용점수·대출·연체 이력이 들어 있으므로 동의한 요청만 받고, 관리자와 직원만 볼 수 있다.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { migrationSql } from "../lib/migration";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { account, audit } from "../lib/benefit-store";

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const pick = z.string().trim().min(1).max(40);
export const fundLeadSchema = z.object({
  requestKey: z.string().min(8).max(100),
  consent: z.literal(true),
  entity: z.enum(["개인", "법인"]),
  openedYear: z.number().int().min(1900).max(2100), openedMonth: z.number().int().min(1).max(12),
  industry: pick, province: pick, district: z.string().trim().max(40),
  revenue: z.array(z.object({ year: z.number().int().min(2000).max(2100), band: pick }).strict()).length(3),
  creditKcb: pick, creditNice: pick,
  loans: z.array(z.object({ lender: z.string().trim().min(1).max(40), amount: pick }).strict()).max(20),
  issues: z.array(z.enum(["연체 이력", "보증사고 이력", "세금 체납"])).max(3),
  premises: z.enum(["임차", "자가"]), premisesValue: pick,
  home: z.enum(["임차", "자가"]), homeValue: pick,
  businessName: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(30),
  phone: z.string().trim().regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "휴대폰 번호를 확인해 주세요."),
}).strict();
export type FundLead = z.infer<typeof fundLeadSchema>;

let ready: Promise<unknown> | undefined;
const table = () => (ready ??= pool.query(migrationSql("004-fund-leads.sql")));
const digits = (s: string) => s.replace(/\D/g, "");

/** 같은 요청은 한 번만 저장한다. 같은 번호로 하루 3번까지만 받는다(장난·반복 방지). */
export async function saveFundLead(input: unknown, userId: string | null) {
  const { requestKey, consent: _consent, businessName, name, phone, ...answers } = fundLeadSchema.parse(input);
  await table();
  const tel = digits(phone);
  const again = (await pool.query("SELECT id FROM iroun_fund_leads WHERE request_key=$1", [requestKey])).rows[0];
  if (again) return { id: again.id as string, reused: true };
  const today = (await pool.query("SELECT count(*)::int AS n FROM iroun_fund_leads WHERE phone=$1 AND created_at>now()-interval '1 day'", [tel])).rows[0].n as number;
  if (today >= 3) throw fail("이미 접수됐어요. 담당자가 곧 연락드려요.", 429);
  const id = randomUUID();
  await pool.query("INSERT INTO iroun_fund_leads(id,user_id,phone,name,business_name,answers,request_key,consent_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())",
    [id, userId, tel, name, businessName, JSON.stringify(answers), requestKey]);
  return { id, reused: false };
}

const hits = new Map<string, number[]>();
function throttle(req: Request) {
  const key = req.ip ?? "unknown", now = Date.now(), recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 10) throw fail("잠시 후 다시 시도해 주세요.", 429);
  hits.set(key, [...recent, now]);
  if (hits.size > 5000) hits.clear();
}
async function staff(req: Request) {
  const id = getAuth(req).userId;
  if (!id) throw fail("로그인 후 이용해 주세요.", 401);
  const a = await account(id);
  if (a.role !== "admin" && !(a.role === "staff" && (await pool.query("SELECT 1 FROM iroun_staff WHERE user_id=$1 AND enabled=true", [id])).rowCount)) throw fail("회사 담당자만 이용할 수 있습니다.", 403);
  return a;
}

export const fundsRouter = Router();
fundsRouter.post("/fund/diagnosis", async (req, res) => {
  throttle(req);
  const saved = await saveFundLead(req.body, getAuth(req).userId ?? null);
  res.set("Cache-Control", "no-store").json({ id: saved.id, message: "담당자에게 전달했어요." });
});
fundsRouter.get("/office/fund-leads", async (req, res) => {
  await staff(req); await table();
  const rows = (await pool.query("SELECT id,user_id,phone,name,business_name,answers,state,memo,created_at,updated_at FROM iroun_fund_leads ORDER BY created_at DESC LIMIT 500")).rows;
  res.set("Cache-Control", "private, no-store").json({ leads: rows });
});
fundsRouter.post("/office/fund-leads/:id", async (req, res) => {
  const a = await staff(req); await table();
  const input = z.object({ state: z.enum(["접수됨", "연락 중", "안내 완료", "종료"]), memo: z.string().max(2000) }).strict().parse(req.body);
  const r = await pool.query("UPDATE iroun_fund_leads SET state=$2,memo=$3,updated_at=now() WHERE id=$1", [String(req.params.id), input.state, input.memo]);
  if (!r.rowCount) throw fail("요청을 찾을 수 없습니다.", 404);
  await audit(a.id, "fund-lead.update", String(req.params.id), { state: input.state });
  res.json({ message: "저장했습니다." });
});
fundsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const e = err as { status?: number; message?: string };
  if (!(err instanceof z.ZodError) && !e.status) return next(err);
  res.status(err instanceof z.ZodError ? 400 : e.status!).set("Cache-Control", "no-store").json({ message: err instanceof z.ZodError ? "입력 내용을 확인해 주세요." : e.message });
});
