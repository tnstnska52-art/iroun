import { z } from "zod";

export const personalSchema = z.object({
  employment: z.array(z.enum(["근로자","사업자","구직 중","해당 없음"])).max(4).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  province: z.string().max(40).optional(), district: z.string().max(40).optional(),
  income: z.string().max(50).optional(), household: z.string().max(40).optional(),
  children: z.number().int().min(0).max(30).optional(), housing: z.string().max(40).optional(),
}).strict();
export const businessSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().max(80).optional(),
  province: z.string().max(40).optional(), district: z.string().max(40).optional(),
  entity: z.string().max(40).optional(), industry: z.string().max(80).optional(),situation:z.string().max(40).optional(),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{
    const d=new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===s && d.getTime()<=Date.now() && s>="1900-01-01";
  },"실제 개업 날짜를 입력하거나 모름으로 남겨 주세요.").optional(),
  revenue: z.string().max(50).optional(), employees: z.number().int().min(0).max(100000).optional(),
}).strict();
export const profileSchema = z.object({
  unknownAnswers: z.array(z.string().min(1).max(120)).max(500).optional(),
  personal: personalSchema, businesses: z.array(businessSchema).max(30),
  step: z.number().int().min(0).max(500),
}).strict().refine(p => new Set(p.businesses.map(b => b.id)).size === p.businesses.length, "사업장 식별자는 중복될 수 없습니다.");
export const preferencesSchema = z.object({
  largeText: z.boolean(), notifications: z.boolean(), privacyConsent: z.boolean(), personalizedAlerts: z.boolean(),
  accountConsent:z.boolean().optional(),termsConsent:z.boolean().optional(),
}).strict();
export const trackingSchema = z.object({
  saved: z.boolean(), stage: z.enum(["관심", "신청 준비", "신청함", "결과 확인", "지급 확인"]),
  checkedDocuments: z.array(z.string().max(200)).max(100), deadlineReminder: z.boolean(),
}).strict();
const fields = ["province", "district", "birthYear", "age", "income", "household", "children", "housing", "entity", "industry", "situation", "openedAt", "revenue", "employees", "duplicateBenefit"];
export const ruleSchema = z.object({
  scope: z.enum(["personal", "business"]),
  field: z.enum(fields as [string, ...string[]]),
  operator: z.enum(["eq", "in", "gte", "lte", "before", "after"]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
  label: z.string().min(1).max(200),
}).strict().superRefine((r, ctx) => {
  if (r.operator === "in" && !Array.isArray(r.value)) ctx.addIssue({code: "custom", message: "포함 조건은 값 목록이 필요합니다."});
  if (["gte","lte"].includes(r.operator) && typeof r.value !== "number") ctx.addIssue({code: "custom", message: "수치 조건은 숫자가 필요합니다."});
});
export const benefitSchema = z.object({
  id: z.string().min(1).max(80), title: z.string().min(1).max(200),
  kind: z.enum(["지원금", "환급금"]), audience: z.enum(["사업", "개인", "가구"]),
  category: z.string().min(1).max(60), region: z.string().min(1).max(80),
  agency: z.string().min(1).max(100), sourceUrl: z.string().url().max(1500), sourceId: z.string().min(1).max(200),
  summary: z.string().max(3000), support: z.string().max(5000), calculation: z.string().max(3000),
  checks: z.array(z.string().max(500)).max(50), documents: z.array(z.string().max(200)).max(50),
  startsAt: z.string().max(40), endsAt: z.string().max(40), checkedAt: z.string().max(40),
  budgetStatus: z.enum(["확인 필요", "소진", "해당 없음"]),
  status: z.enum(["확인 필요", "접수 중", "마감", "상시 조회"]),
  reviewStatus: z.enum(["검토대기", "공개", "비공개"]), isTest: z.boolean(),
  rules: z.array(ruleSchema).max(100),
  // 공고 원문에 적힌 최대 지원금액(원). 원문에 없으면 비워 둔다. 0원이나 추정값을 넣지 않는다.
  maxAmount: z.number().int().positive().max(100_000_000_000).optional(),
  // 신청 난이도 1(쉬움)~5(어려움). 운영자가 직접 정하면 이 값을 쓰고, 비우면 서류·조건 수로 계산한다.
  difficulty: z.number().int().min(1).max(5).optional(),
}).strict();
export type Benefit = z.infer<typeof benefitSchema>;
export type Profile = z.infer<typeof profileSchema>;
export function excludedCategory(b: Pick<Benefit, "title" | "category">) {
  // Negative mentions are not the funded subject: "장비 지원(대출·보증료 제외)".
  // Still conservative; operators review ambiguous wording against the source.
  const item="(?:특례\\s*보증|보증\\s*(?:보험)?료(?:\\s*지원)?|보증\\s*수수료|(?:대출\\s*)?이자\\s*지원|이차\\s*보전|금리\\s*지원|대출(?:\\s*상품)?|융자)";
  const negatives=new RegExp(`${item}(?:\\s*(?:[·,/]|및)\\s*${item})*(?:은|는|을|를)?\\s*(?:제외|미지원|불포함|없이|지원하지\\s*않음)`,"g");
  const text = `${b.title} ${b.category}`.replace(negatives,"");
  return /특례\s*보증|보증\s*(보험)?료|보증\s*수수료|이자.*(지원|보전)|이차\s*보전|금리.*지원|대출|융자/.test(text);
}

export function normalizeSourceKey(b: Pick<Benefit,"agency"|"sourceId">) {
  return `${b.agency.normalize("NFKC").replace(/\s+/g,"").toLowerCase()}|${b.sourceId.normalize("NFKC").trim().toLowerCase()}`;
}

export function officialUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password &&
      (u.hostname.endsWith(".go.kr") || ["gov.kr", "www.gov.kr", "bizinfo.go.kr", "www.bizinfo.go.kr", "sbiz24.kr", "www.sbiz24.kr", "nhis.or.kr", "www.nhis.or.kr", "nps.or.kr", "www.nps.or.kr"].includes(u.hostname));
  } catch { return false; }
}
export function publicBenefit(b: Benefit) {
  return b.reviewStatus === "공개" && !b.isTest && !excludedCategory(b) && officialUrl(b.sourceUrl) &&
    Number.isFinite(Date.parse(b.checkedAt)) && Date.parse(b.checkedAt) <= Date.now();
}
export interface EntitlementSource { expiresAt: string; revoked?: boolean; state?: string }
export function entitlement(subscription?: EntitlementSource, grant?: EntitlementSource, now = Date.now()) {
  const subscriptionActive = !!subscription && ["active", "cancelled"].includes(subscription.state ?? "") && Date.parse(subscription.expiresAt) > now;
  const grantActive = !!grant && !grant.revoked && Date.parse(grant.expiresAt) > now;
  return {
    active: subscriptionActive || grantActive, subscriptionActive, grantActive,
    ...(subscription ? {subscriptionUntil: subscription.expiresAt} : {}),
    ...(grant ? {grantUntil: grant.expiresAt} : {}),
  };
}
function compare(actual: unknown, op: string, expected: unknown): boolean | undefined {
  if (actual === undefined || actual === null || actual === "" || actual === "잘 모르겠어요" || actual === "모름") return undefined;
  if (op === "eq") return actual === expected;
  if (op === "in") return Array.isArray(expected) ? expected.includes(actual) : undefined;
  if (op === "gte" || op === "lte") {
    if (typeof actual !== "number" || typeof expected !== "number") return undefined;
    return op === "gte" ? actual >= expected : actual <= expected;
  }
  if (op === "before" || op === "after") {
    if (typeof actual !== "string" || typeof expected !== "string" || !Number.isFinite(Date.parse(actual)) || !Number.isFinite(Date.parse(expected))) return undefined;
    return op === "before" ? Date.parse(actual) <= Date.parse(expected) : Date.parse(actual) >= Date.parse(expected);
  }
  return undefined;
}
export function matchBenefit(b: Benefit, p: Profile, now = new Date()) {
  const year=new Date(now.getTime()+9*3600000).getUTCFullYear();
  const businesses = b.audience === "사업" || b.rules.some(r => r.scope === "business") ? (p.businesses.length ? p.businesses : [{id: ""}]) : [{id: ""}];
  return businesses.map(business => {
    const reasons: string[] = [], unknowns: string[] = [...b.checks], exclusions: string[] = [];
    if(b.region!=="전국"){
      const subject=b.audience==="사업"?business:p.personal;
      const parts=b.region.trim().split(/\s+/),regionProvince=provinceKey(parts[0]);
      if(!regionProvince) unknowns.push("공고의 지원 관할을 공식 출처에서 확인해야 합니다.");
      else if(!subject.province) unknowns.push(`${b.audience==="사업"?"사업장":"거주지"} 시·도를 입력하거나 확인해 주세요.`);
      else if(provinceKey(subject.province)!==regionProvince) exclusions.push(`${b.audience==="사업"?"사업장":"거주지"}이 공고의 지원 관할(${b.region})과 다릅니다.`);
      else {
        reasons.push(`${b.audience==="사업"?"사업장":"거주지"} 시·도가 지원 관할과 일치합니다.`);
        if(parts[1]){
          if(!subject.district) unknowns.push("공고의 지원 시·군·구 확인이 필요합니다.");
          else if(subject.district.trim()!==parts[1]) exclusions.push("시·군·구가 공고의 지원 관할과 다릅니다.");
          else reasons.push("시·군·구가 지원 관할과 일치합니다.");
        }
      }
    }
    if (excludedCategory(b)) exclusions.push("이 서비스에서 제외한 보증·대출 관련 사업입니다.");
    if (b.budgetStatus === "소진" || b.status === "마감") exclusions.push("공고가 마감되었거나 예산이 소진되었습니다.");
    if (b.endsAt && Number.isFinite(noticeTime(b.endsAt,"end")) && noticeTime(b.endsAt,"end") < now.getTime()) exclusions.push("신청기간이 지났습니다.");
    if (b.startsAt && Number.isFinite(noticeTime(b.startsAt,"start")) && noticeTime(b.startsAt,"start") > now.getTime()) unknowns.push("아직 신청기간 전입니다.");
    if (b.status === "확인 필요") unknowns.push("현재 접수상태를 공식 신청처에서 확인해 주세요.");
    if (b.budgetStatus === "확인 필요") unknowns.push("예산 잔여를 확인해 주세요.");
    if (!b.rules.length) unknowns.push("세부 자격은 공식 신청처에서 확인해야 합니다.");
    for (const r of b.rules) {
      const subject: Record<string, unknown> = r.scope === "business" ? business : p.personal;
      let actual = r.field === "age" && p.personal.birthYear ? year - p.personal.birthYear - 1 : subject[r.field];
      let expected=r.value;
      if(r.field==="province"){
        if(typeof actual==="string") actual=provinceKey(actual)??actual;
        expected=Array.isArray(expected)?expected.map(v=>typeof v==="string"?provinceKey(v)??v:v):typeof expected==="string"?provinceKey(expected)??expected:expected;
      }
      // Only birth year is collected: exact age near a cutoff cannot be guaranteed.
      const result = r.field === "age" && p.personal.birthYear && typeof r.value === "number" && Math.abs(year - p.personal.birthYear - r.value) <= 1 ? undefined : compare(actual, r.operator, expected);
      if (result === true) reasons.push(`${r.label}: 입력 조건과 일치합니다.`);
      else if (result === false) exclusions.push(`${r.label}: 입력 조건과 다릅니다.`);
      else unknowns.push(`${r.label}: 추가 확인이 필요합니다.`);
    }
    return {benefitId: b.id, businessId: business.id, result: exclusions.length ? "대상 제외" : unknowns.length ? "추가 확인 필요" : "조건 일치", reasons, unknowns, exclusions};
  });
}

const PROVINCE_ALIASES = [
  ["서울","서울특별시","서울시"],["부산","부산광역시","부산시"],["대구","대구광역시"],["인천","인천광역시"],
  ["광주","광주광역시"],["대전","대전광역시"],["울산","울산광역시"],["세종","세종특별자치시"],
  ["경기","경기도"],["강원","강원도","강원특별자치도"],["충북","충청북도"],["충남","충청남도"],
  ["전북","전라북도","전북특별자치도"],["전남","전라남도"],["경북","경상북도"],["경남","경상남도"],["제주","제주도","제주특별자치도"],
];
function provinceKey(s:string) {return PROVINCE_ALIASES.find(a=>a.includes(s.trim()))?.[0];}
export function noticeTime(value:string,boundary:"start"|"end"){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(`${value}T${boundary==="start"?"00:00:00.000":"23:59:59.999"}+09:00`):Date.parse(value);
}
