/**
 * AI 공고 정리: 공고 원문(기업마당 상세 페이지 등)을 읽어 고객 조건 비교에 쓰는 항목을 뽑는다.
 *
 * - ANTHROPIC_API_KEY 가 있을 때만 동작한다. 없으면 아무 호출도 하지 않는다.
 * - 원문에 적힌 내용만 쓰게 지시하고, 못 찾은 항목은 비워 둔다(추정 금지).
 * - 뽑은 결과로 지역·조건(rules)·금액·기간·서류를 채운다.
 * - IROUN_AI_AUTO_PUBLISH 가 "false" 가 아니면: 사업자 지원사업이고 대출·보증이 아니며
 *   기간이 지나지 않은 공고는 공개, 사업자 대상이 아니거나 대출·보증이면 비공개로 바꾼다.
 * - 고객 조회에는 AI 를 쓰지 않는다. 여기서 한 번 정리해 둔 조건표와 비교만 한다.
 */
import { pool } from "@workspace/db";
import { audit } from "./benefit-store";
import { benefitSchema, excludedCategory, publicBenefit, type Benefit } from "./benefit-domain";
import { logger } from "./logger";

type Rule = Benefit["rules"][number];

/** 앱·홈페이지에서 고르는 업종 목록과 같아야 한다. */
export const AI_INDUSTRIES = ["음식점", "도소매", "서비스", "제조", "건설", "운수", "숙박", "교육", "보건·복지", "정보통신", "농림어업", "기타"] as const;
const PROVINCE_KEYS = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
export const AI_VERSION = 2;
const SOURCES = ["bizinfo-", "gov24-", "welfareCentral-", "welfareLocal-"];

export interface AiResult {
  is_business_support: boolean;
  is_loan_or_guarantee: boolean;
  region: string;
  industries: string[];
  max_employees: number | null;
  min_employees: number | null;
  max_years_in_business: number | null;
  min_years_in_business: number | null;
  max_revenue_won: number | null;
  min_revenue_won: number | null;
  entity: "개인" | "법인" | "무관";
  target: string[];
  max_amount_won: number | null;
  starts_at: string | null;
  ends_at: string | null;
  documents: string[];
  summary: string;
  unclear: string[];
  fit_industries: string[];
  small_business_fit: number;
}

const TOOL = {
  name: "save_conditions",
  description: "공고 원문에서 읽은 지원 조건을 저장한다. 원문에 없는 값은 null 또는 빈 배열로 둔다.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["is_business_support", "is_loan_or_guarantee", "region", "industries", "max_employees", "min_employees", "max_years_in_business", "min_years_in_business", "max_revenue_won", "min_revenue_won", "entity", "target", "max_amount_won", "starts_at", "ends_at", "documents", "summary", "unclear", "fit_industries", "small_business_fit"],
    properties: {
      is_business_support: { type: "boolean", description: "사업자(소상공인·중소기업·스타트업 등)가 신청하는 지원사업이면 true. 개인·가구 복지, 행사 안내, 기관 내부 공고, 수요조사·설문만이면 false." },
      is_loan_or_guarantee: { type: "boolean", description: "대출·융자·보증·이자 지원·이차보전이 주된 내용이면 true." },
      region: { type: "string", description: `지원 대상 사업장 소재지. 형식: "전국" 또는 시·도 약칭(${PROVINCE_KEYS.slice(1).join(", ")}) 또는 "시·도약칭 시군구명"(예: "경기 시흥시"). 원문에 지역 제한이 없으면 "전국". 주관기관이 지자체·지역 기관이고 '관내/도내/시내 소재 기업' 대상이면 그 지역.` },
      industries: { type: "array", items: { type: "string", enum: [...AI_INDUSTRIES] }, description: "지원 대상 업종이 특정되면 해당하는 것만. 업종 제한이 없으면 빈 배열." },
      max_employees: { type: ["integer", "null"], description: "상시근로자 수 상한(명). 예: '상시근로자 10인 미만' → 9. 없으면 null." },
      min_employees: { type: ["integer", "null"], description: "상시근로자 수 하한(명). 없으면 null." },
      max_years_in_business: { type: ["number", "null"], description: "업력 상한(년). 예: '창업 7년 이내' → 7. 없으면 null." },
      min_years_in_business: { type: ["number", "null"], description: "업력 하한(년). 예: '업력 3년 이상' → 3. 없으면 null." },
      max_revenue_won: { type: ["integer", "null"], description: "연매출 상한(원). 없으면 null." },
      min_revenue_won: { type: ["integer", "null"], description: "연매출 하한(원). 없으면 null." },
      entity: { type: "string", enum: ["개인", "법인", "무관"], description: "개인사업자만/법인만 대상이면 그 값, 아니면 무관." },
      target: { type: "array", items: { type: "string", enum: ["소상공인", "소기업", "중소기업", "중견기업", "스타트업", "예비창업자", "수출기업", "기타"] } },
      max_amount_won: { type: ["integer", "null"], description: "기업 1곳당 최대 지원 금액(원). 총 사업예산이 아니라 업체당 한도. 없으면 null." },
      starts_at: { type: ["string", "null"], description: "신청 시작일 YYYY-MM-DD. 없으면 null." },
      ends_at: { type: ["string", "null"], description: "신청 마감일 YYYY-MM-DD. 예산 소진 시까지·상시면 null." },
      documents: { type: "array", items: { type: "string" }, description: "신청 제출 서류 이름(최대 12개)." },
      summary: { type: "string", description: "사장님이 이해하기 쉬운 지원 내용 요약 2문장 이내." },
      unclear: { type: "array", items: { type: "string" }, description: "원문에서 확인하지 못한 중요한 자격 조건(최대 5개)." },
      fit_industries: { type: "array", items: { type: "string", enum: [...AI_INDUSTRIES] }, description: "자격 제한과 별개로, 이 사업이 실제로 쓸모 있는 업종(최대 4개). 예: 음식점 위생시설 지원 → 음식점, 해외인증·수출 → 제조, SW 개발 → 정보통신. 업종과 무관하게 모든 자영업자에게 쓸모 있으면(카드수수료·노무·경영 기초) 빈 배열." },
      small_business_fit: { type: "integer", minimum: 1, maximum: 5, description: "동네 가게·1~4인 소상공인이 실제로 신청해 혜택을 볼 가능성. 5=소상공인 전용·서류 간단, 3=중소기업 일반, 1=연구개발·대규모 컨소시엄·기술기업 전용." },
    },
  },
} as const;

const SYSTEM = [
  "너는 대한민국 정부·지자체 지원사업 공고를 읽고 신청 자격을 구조화하는 담당자다.",
  "반드시 원문에 적힌 내용만 사용한다. 추측하거나 일반 상식으로 채우지 않는다.",
  "값을 찾지 못하면 null 또는 빈 배열로 두고, 중요한 것은 unclear 에 적는다.",
  "금액은 원 단위 정수로 바꾼다(예: 3천만원 → 30000000). 업체당 한도가 아닌 총예산은 max_amount_won 에 넣지 않는다.",
].join("\n");

let workingModel: string | null = null;
function candidateModels() {
  const list = [process.env.IROUN_AI_MODEL?.trim(), "claude-haiku-5-5", "claude-haiku-4-5", "claude-sonnet-5-5"].filter(Boolean) as string[];
  return workingModel ? [workingModel, ...list.filter((m) => m !== workingModel)] : [...new Set(list)];
}

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY?.trim();

async function callClaude(title: string, agency: string, text: string, fetcher: typeof fetch = fetch): Promise<{ result: AiResult; model: string }> {
  const key = process.env.ANTHROPIC_API_KEY!.trim();
  let lastError = "";
  for (const model of candidateModels()) {
    const res = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 1200, temperature: 0, system: SYSTEM,
        tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `공고 제목: ${title}\n주관·소관 기관: ${agency}\n\n공고 원문:\n${text}` }],
      }),
    });
    if (res.status === 404 || res.status === 400) {
      const body = await res.text();
      if (/model/i.test(body)) { lastError = `model ${model} unavailable`; continue; }
      throw new Error(`AI 요청 거절(${res.status})`);
    }
    if (res.status === 429 || res.status === 529) throw Object.assign(new Error("AI 호출 한도"), { retry: true });
    if (!res.ok) throw new Error(`AI 응답 실패(${res.status})`);
    const data = await res.json() as { content?: { type: string; input?: unknown }[] };
    const block = data.content?.find((c) => c.type === "tool_use");
    if (!block?.input) throw new Error("AI 응답 형식 확인 필요");
    workingModel = model;
    return { result: block.input as AiResult, model };
  }
  throw new Error(`사용 가능한 AI 모델 없음: ${lastError}`);
}

const strip = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
  .replace(/[ \t\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/** 공고 원문 글자. 기업마당은 공식 상세 페이지를 읽고, 그 외는 저장된 요약을 쓴다. */
export async function noticeText(b: Benefit, fetcher: typeof fetch = fetch): Promise<string> {
  const base = [b.summary, b.support !== b.summary ? b.support : "", b.checks.join("\n")].filter(Boolean).join("\n");
  if (!b.sourceUrl.startsWith("https://www.bizinfo.go.kr/")) return base.slice(0, 7000);
  try {
    const res = await fetcher(b.sourceUrl, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 (iroun-benefits notice reader)" } });
    if (!res.ok) return base.slice(0, 7000);
    const text = strip(await res.text());
    const start = Math.max(0, text.indexOf(b.title.slice(0, 15)));
    const body = text.slice(start, start + 9000);
    return (body.length > 300 ? body : `${base}\n${body}`).slice(0, 9000);
  } catch {
    return base.slice(0, 7000);
  }
}

const isoDate = (s: string | null | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : "";
};
const yearsAgo = (years: number, now: Date) => {
  const d = new Date(now.getTime() + 9 * 3600000);
  d.setUTCFullYear(d.getUTCFullYear() - Math.round(years));
  return d.toISOString().slice(0, 10);
};
function normalizeRegion(r: string): string {
  const s = (r ?? "").trim().replace(/\s+/g, " ");
  if (!s || /전국|제한\s*없/.test(s)) return "전국";
  const [p, d] = s.split(" ");
  if (!PROVINCE_KEYS.includes(p!)) return "관할 확인 필요";
  return d && /^[가-힣]{1,5}(시|군|구)$/.test(d) ? `${p} ${d}` : p!;
}

/** AI 결과를 공고에 반영한다. 순수 함수(테스트 대상). */
export function applyAi(b: Benefit, x: AiResult, model: string, now = new Date()): Benefit {
  const rules: Rule[] = [];
  const industries = (x.industries ?? []).filter((i): i is (typeof AI_INDUSTRIES)[number] => (AI_INDUSTRIES as readonly string[]).includes(i));
  if (industries.length && industries.length < AI_INDUSTRIES.length) rules.push({ scope: "business", field: "industry", operator: "in", value: industries, label: `업종: ${industries.join("·")}` });
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const maxE = int(x.max_employees), minE = int(x.min_employees);
  if (maxE !== null && maxE < 100000) rules.push({ scope: "business", field: "employees", operator: "lte", value: maxE, label: `상시근로자 ${maxE}명 이하` });
  if (minE !== null && minE > 0) rules.push({ scope: "business", field: "employees", operator: "gte", value: minE, label: `상시근로자 ${minE}명 이상` });
  const maxY = typeof x.max_years_in_business === "number" && x.max_years_in_business > 0 && x.max_years_in_business < 100 ? x.max_years_in_business : null;
  const minY = typeof x.min_years_in_business === "number" && x.min_years_in_business > 0 && x.min_years_in_business < 100 ? x.min_years_in_business : null;
  if (maxY !== null) rules.push({ scope: "business", field: "openedAt", operator: "after", value: yearsAgo(maxY, now), label: `업력 ${maxY}년 이내` });
  if (minY !== null) rules.push({ scope: "business", field: "openedAt", operator: "before", value: yearsAgo(minY, now), label: `업력 ${minY}년 이상` });
  const maxR = int(x.max_revenue_won), minR = int(x.min_revenue_won);
  if (maxR !== null && maxR > 0 && maxR <= 100_000_000_000) rules.push({ scope: "business", field: "revenue", operator: "lte", value: maxR, label: `연매출 ${Math.round(maxR / 1e8 * 10) / 10}억 원 이하` });
  if (minR !== null && minR > 0 && minR <= 100_000_000_000) rules.push({ scope: "business", field: "revenue", operator: "gte", value: minR, label: `연매출 ${Math.round(minR / 1e8 * 10) / 10}억 원 이상` });

  const checks: string[] = [];
  if (x.entity === "법인") checks.push("법인사업자만 신청할 수 있습니다.");
  if (x.entity === "개인") checks.push("개인사업자만 신청할 수 있습니다.");
  const unclear = (x.unclear ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 5).map((s) => s.trim().slice(0, 200));

  const starts = isoDate(x.starts_at) || b.startsAt.slice(0, 10);
  const ends = isoDate(x.ends_at) || b.endsAt.slice(0, 10);
  const endT = ends ? Date.parse(`${ends}T23:59:59+09:00`) : NaN;
  const startT = starts ? Date.parse(`${starts}T00:00:00+09:00`) : NaN;
  const status: Benefit["status"] = Number.isFinite(endT) && endT < now.getTime() ? "마감"
    : Number.isFinite(startT) && startT > now.getTime() ? "확인 필요"
    : Number.isFinite(endT) ? "접수 중" : b.status === "마감" ? "마감" : "상시 조회";
  const amount = int(x.max_amount_won);
  const summary = typeof x.summary === "string" && x.summary.trim() ? x.summary.trim().slice(0, 1000) : b.summary;
  const region = normalizeRegion(x.region);

  return benefitSchema.parse({
    ...b,
    region: region === "관할 확인 필요" && b.region !== "관할 확인 필요" ? b.region : region,
    rules,
    summary,
    ...(amount && amount > 0 && amount <= 100_000_000_000 ? { maxAmount: amount } : {}),
    documents: (x.documents ?? []).filter((d) => typeof d === "string" && d.trim()).slice(0, 12).map((d) => d.trim().slice(0, 200)),
    startsAt: starts, endsAt: ends,
    status,
    budgetStatus: status === "마감" ? b.budgetStatus : "해당 없음",
    checks: checks.slice(0, 50),
    fit: { industries: (x.fit_industries ?? []).filter((i) => (AI_INDUSTRIES as readonly string[]).includes(i)).slice(0, 4), small: Math.max(1, Math.min(5, Math.round(Number(x.small_business_fit) || 3))) },
    extraction: {
      confidence: Math.max(0, Math.min(100, 100 - unclear.length * 15)),
      evidence: [], missing: unclear.slice(0, 20).map((s) => s.slice(0, 60)), cautions: unclear,
      at: now.toISOString(), ai: { model: model.slice(0, 60), version: AI_VERSION },
    },
  });
}

/** 정리 후 공개 여부. 사람이 직접 비공개로 내린 공고는 다시 올리지 않는다. */
export function aiReviewStatus(prev: Benefit, next: Benefit, x: AiResult): Benefit["reviewStatus"] {
  if (process.env.IROUN_AI_AUTO_PUBLISH === "false") return prev.reviewStatus;
  if (!x.is_business_support || x.is_loan_or_guarantee || excludedCategory(next)) return "비공개";
  if (prev.reviewStatus === "비공개" && !prev.extraction?.ai) return "비공개";
  if (next.status === "마감") return prev.reviewStatus === "공개" ? "공개" : "검토대기";
  return publicBenefit({ ...next, reviewStatus: "공개" }) ? "공개" : prev.reviewStatus;
}

export const aiJob = { running: false, total: 0, done: 0, failed: 0, published: 0, hidden: 0, startedAt: "", finishedAt: "", lastError: "", model: "" };

const needsAi = (b: Benefit) => !b.isTest && b.audience === "사업" && SOURCES.some((s) => b.id.startsWith(s))
  && (!b.extraction?.ai || b.extraction.ai.version < AI_VERSION
    // 원문이 바뀌어 다시 검토대기가 된 공고는 다시 읽는다.
    || (b.reviewStatus === "검토대기" && Date.parse(b.checkedAt) > Date.parse(b.extraction.at)));

/** 아직 AI 정리를 안 한 공고를 정리한다. 동시에 한 번만 돈다. */
export async function runAiStructuring(limit = 2000, concurrency = 4, fetcher: typeof fetch = fetch) {
  if (!aiReady() || aiJob.running) return { ...aiJob, skipped: true };
  const rows = (await pool.query("SELECT data FROM iroun_benefits ORDER BY updated_at DESC")).rows.map((r) => r.data as Benefit);
  const todo = rows.filter(needsAi).slice(0, limit);
  Object.assign(aiJob, { running: true, total: todo.length, done: 0, failed: 0, published: 0, hidden: 0, startedAt: new Date().toISOString(), finishedAt: "", lastError: "" });
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const prev = todo[i++]!;
      try {
        const text = await noticeText(prev, fetcher);
        let out: { result: AiResult; model: string } | undefined;
        for (let attempt = 0; attempt < 3 && !out; attempt++) {
          try { out = await callClaude(prev.title, prev.agency, text, fetcher); }
          catch (e) { if ((e as { retry?: boolean }).retry && attempt < 2) await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); else throw e; }
        }
        aiJob.model = out!.model;
        const next = applyAi(prev, out!.result, out!.model);
        next.reviewStatus = aiReviewStatus(prev, next, out!.result);
        const saved = await pool.query("UPDATE iroun_benefits SET data=$2,updated_at=now() WHERE id=$1 AND data->>'checkedAt'=$3 RETURNING id", [prev.id, JSON.stringify(next), prev.checkedAt]);
        if (saved.rowCount) {
          await audit("system:ai-structure", next.reviewStatus !== prev.reviewStatus ? `AI 정리·${next.reviewStatus}` : "AI 정리", prev.id, { before: { reviewStatus: prev.reviewStatus, region: prev.region, rules: prev.rules }, after: { reviewStatus: next.reviewStatus, region: next.region, rules: next.rules, maxAmount: next.maxAmount }, ai: out!.result });
          if (next.reviewStatus === "공개" && prev.reviewStatus !== "공개") aiJob.published++;
          if (next.reviewStatus === "비공개" && prev.reviewStatus !== "비공개") aiJob.hidden++;
        }
        aiJob.done++;
      } catch (e) {
        aiJob.failed++; aiJob.done++;
        aiJob.lastError = (e as Error).message.slice(0, 200);
        if (/사용 가능한 AI 모델 없음|\((401|403)\)/.test(aiJob.lastError)) { i = todo.length; }
      }
    }
  };
  try { await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker)); }
  finally { aiJob.running = false; aiJob.finishedAt = new Date().toISOString(); logger.info({ ...aiJob }, "AI 공고 정리 완료"); }
  return { ...aiJob };
}
