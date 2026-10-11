/**
 * 공고 원문에서 맞춤 비교에 쓰는 항목을 뽑는다.
 * - 원문에 적힌 내용만 뽑는다. 추정하지 않는다.
 * - 뽑은 항목마다 근거 문장을 함께 남긴다(운영자가 원문과 대조할 수 있게).
 * - 뽑지 못한 항목은 missing 에 남겨 고객 화면에서 "확인 필요"로 보이게 한다.
 */
import { type Benefit } from "./benefit-domain";

type Rule = Benefit["rules"][number];
export type Evidence = { field: string; label: string; quote: string };
export type Extraction = {
  region?: string;
  rules: Rule[];
  maxAmount?: number;
  documents: string[];
  startsAt?: string;
  endsAt?: string;
  status?: Benefit["status"];
  budgetStatus: Benefit["budgetStatus"];
  evidence: Evidence[];
  /** 0~100. 지역·금액·기간·자격·서류를 얼마나 찾았는지. 정확도 보증이 아니다. */
  confidence: number;
  missing: string[];
  /** 자동 공개를 막아야 하는 애매한 점 */
  cautions: string[];
};

const PROVINCES: [string, string[]][] = [
  ["서울", ["서울특별시", "서울시", "서울"]], ["부산", ["부산광역시", "부산시", "부산"]], ["대구", ["대구광역시", "대구"]],
  ["인천", ["인천광역시", "인천"]], ["광주", ["광주광역시"]], ["대전", ["대전광역시", "대전"]], ["울산", ["울산광역시", "울산"]],
  ["세종", ["세종특별자치시", "세종시", "세종"]], ["경기", ["경기도", "경기"]], ["강원", ["강원특별자치도", "강원도", "강원"]],
  ["충북", ["충청북도", "충북"]], ["충남", ["충청남도", "충남"]], ["전북", ["전북특별자치도", "전라북도", "전북"]],
  ["전남", ["전라남도", "전남"]], ["경북", ["경상북도", "경북"]], ["경남", ["경상남도", "경남"]],
  ["제주", ["제주특별자치도", "제주도", "제주"]],
];
// "광주"는 경기도 광주시와 겹치므로 "광주광역시"만 시·도로 본다.
const INDUSTRY: [string, RegExp][] = [
  ["음식점", /음식점업?|외식업|요식업|식당/], ["도소매", /도\s*·?\s*소매업?|도매업|소매업/], ["제조", /제조업|제조\s*기업|제조\s*소공인/],
  ["건설", /건설업/], ["운수", /운수업|운송업|물류업/], ["숙박", /숙박업/], ["교육", /교육\s*서비스업|학원/],
  ["보건·복지", /보건업|사회복지\s*서비스업/], ["정보통신", /정보통신업|소프트웨어|ICT\s*기업/], ["농림어업", /농업|어업|임업|농림어업|농어업/],
  ["서비스", /서비스업/],
];
const DOCS: [string, RegExp][] = [
  ["사업자등록증명", /사업자\s*등록증(?:명원?)?/], ["소상공인확인서", /소상공인\s*확인서/], ["중소기업확인서", /중소기업\s*확인서/],
  ["부가가치세 과세표준증명", /부가가치세\s*과세\s*표준\s*증명원?/], ["국세 납세증명서", /국세\s*(?:완납|납세)\s*증명서?/],
  ["지방세 납세증명서", /지방세\s*(?:완납|납세)\s*증명서?/], ["4대보험 가입자명부", /4대\s*(?:사회)?보험\s*(?:사업장\s*)?가입자\s*명부/],
  ["고용보험 가입자명부", /고용보험\s*(?:피보험자|가입자)\s*명부/], ["임대차계약서", /임대차\s*계약서/], ["사업계획서", /사업\s*계획서/],
  ["신청서", /(?:지원|참여|참가)?\s*신청서/], ["개인정보 수집·이용 동의서", /개인정보\s*(?:수집)?[^.\n]{0,12}동의서/],
  ["통장 사본", /통장\s*사본/], ["법인등기부등본", /법인\s*등기부\s*등본|법인\s*등기사항\s*전부\s*증명서/],
  ["매출 증빙", /매출\s*증빙|표준\s*재무제표\s*증명원?|매출액\s*증명/], ["견적서", /견적서/], ["신분증", /신분증/],
];

const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/[ \t\r]+/g, " ").trim();
/** 원문을 문장·항목 단위로 나눈다. 근거 문장으로 그대로 보여주므로 내용은 바꾸지 않는다. */
export function sentences(text: string) {
  return clean(text).split(/\n+|(?<=[가-힣a-zA-Z)\]][.!?。])\s+|\s+(?=[○●□■▶▷◆◇※•❍☞✔])|\s+(?=\d+\)\s)|;\s*/).map((s) => s.trim()).filter((s) => s.length > 1);
}
const quote = (s: string) => (s.length > 180 ? `${s.slice(0, 177)}…` : s);
const num = (s: string) => Number(s.replace(/,/g, ""));
const UNIT: Record<string, number> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 만: 10_000, 천: 1_000 };
const MONEY = /(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만|천)\s*원?(?:\s*(\d[\d,]*)\s*(천만|백만|만)\s*원?)?/g;
const amountOf = (m: RegExpMatchArray) => Math.round(num(m[1]!) * UNIT[m[2]!]! + (m[3] ? num(m[3]) * UNIT[m[4]!]! : 0));
const ymd = (y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
const validDate = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

function findRegion(title: string, list: string[]) {
  const tryIn = (s: string, needContext: boolean): { region: string; guessedDistrict: boolean } | undefined => {
    if (needContext && !/소재|위치|관내|주소|등록|본사|사업장을\s*둔|거주/.test(s)) return undefined;
    for (const [key, names] of PROVINCES) for (const name of names) {
      const at = s.indexOf(name);
      if (at < 0) continue;
      // "경기 침체", "경기 회복" 같은 일반 낱말은 지역이 아니다.
      if (key === "경기" && name === "경기" && /^경기\s*(침체|회복|불황|부양|활성|악화|둔화|전망|변동)/.test(s.slice(at))) continue;
      const after = s.slice(at + name.length).replace(/^[\]\)\s·,]+/, "");
      const d = after.match(/^([가-힣]{1,4}(?:시|군|구))(?![가-힣]*(?:장|설|행|청|민))/);
      const district = d && !/소상공인|전통시|기업|도시|역시|자치시/.test(d[1]!) && d[1]!.length >= 2 ? d[1]! : "";
      return { region: district ? `${key} ${district}` : key, guessedDistrict: !!district };
    }
    return undefined;
  };
  const inTitle = tryIn(title, false);
  if (inTitle) {
    // 제목에는 시·도만 있고 본문에 같은 시·도의 시·군·구가 적힌 경우 본문 쪽이 더 정확하다.
    if (!inTitle.guessedDistrict) for (const s of list) { const r = tryIn(s, true); if (r?.guessedDistrict && r.region.startsWith(`${inTitle.region} `)) return { ...r, quote: s }; }
    return { ...inTitle, quote: title };
  }
  for (const s of list) { const r = tryIn(s, true); if (r) return { ...r, quote: s }; }
  const nation = [title, ...list].find((s) => /전국(?!\s*최초)/.test(s) && /대상|소재|소상공인|중소기업|기업|모집|지원/.test(s));
  return nation ? { region: "전국", guessedDistrict: false, quote: nation } : undefined;
}

export function extractNotice(input: { title: string; text: string; period?: string; startsAt?: string; endsAt?: string }, now = new Date()): Extraction {
  const title = clean(input.title), list = sentences(input.text);
  const evidence: Evidence[] = [], rules: Rule[] = [], missing: string[] = [], cautions: string[] = [];
  const add = (field: string, label: string, s: string) => evidence.push({ field, label, quote: quote(s) });
  const out: Extraction = { rules, documents: [], budgetStatus: "해당 없음", evidence, confidence: 0, missing, cautions };

  // 지역
  const region = findRegion(title, list);
  if (region) {
    out.region = region.region; add("region", `지역: ${region.region}`, region.quote);
    if (region.guessedDistrict) cautions.push("시·군·구는 제목·본문에서 읽은 값이라 원문 대조가 필요합니다.");
  } else missing.push("지원 지역");

  // 신청기간
  const periodText = [input.period ?? "", ...list.filter((s) => /신청|접수|모집/.test(s) && /기간|기한|마감|까지|~/.test(s))];
  let starts = input.startsAt && validDate(input.startsAt.slice(0, 10)) ? input.startsAt.slice(0, 10) : "";
  let ends = input.endsAt && validDate(input.endsAt.slice(0, 10)) ? input.endsAt.slice(0, 10) : "";
  if (!ends) for (const s of periodText) {
    const ds = [...s.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)].map((m) => ymd(m[1]!, m[2]!, m[3]!)).filter(validDate);
    // "2026. 9. 21. ~ 10. 23." 처럼 뒤쪽 연도가 빠진 표기
    const short = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})[일.\s()가-힣]*[~∼\-–]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\s*[.\-/]\s*\d)/);
    if (ds.length >= 2) { starts = ds[0]!; ends = ds[1]!; }
    else if (short && validDate(ymd(short[1]!, short[4]!, short[5]!))) { starts = ymd(short[1]!, short[2]!, short[3]!); ends = ymd(short[1]!, short[4]!, short[5]!); }
    else if (ds.length === 1 && /까지|마감/.test(s)) ends = ds[0]!;
    if (ends) { add("period", `신청기간: ${starts || "?"} ~ ${ends}`, s); break; }
  }
  if (starts) out.startsAt = starts;
  if (ends) out.endsAt = ends;
  const always = periodText.find((s) => /상시\s*(?:접수|모집|신청)|연중\s*(?:접수|상시)/.test(s));
  if (ends && starts && starts > ends) { cautions.push("신청 시작일이 마감일보다 늦게 읽혔습니다."); delete out.startsAt; delete out.endsAt; missing.push("신청기간"); }
  else if (ends) {
    const end = Date.parse(`${ends}T23:59:59.999+09:00`), start = starts ? Date.parse(`${starts}T00:00:00+09:00`) : -Infinity;
    out.status = end < now.getTime() ? "마감" : start > now.getTime() ? "확인 필요" : "접수 중";
  } else if (always) { out.status = "상시 조회"; add("period", "신청기간: 상시", always); }
  else missing.push("신청기간");
  const budget = list.find((s) => /예산\s*소진|선착순|조기\s*마감/.test(s));
  if (budget) { out.budgetStatus = "확인 필요"; add("budget", "예산이 먼저 끝날 수 있음", budget); }

  // 직원 수
  for (const s of list) {
    const m = s.match(/(?:상시\s*)?(?:근로자|종업원|직원|고용인원)\s*(?:수)?\s*(?:가|이)?\s*(\d+)\s*(?:인|명)\s*(미만|이하|이상|초과)/) ?? s.match(/(\d+)\s*(?:인|명)\s*(미만|이하|이상|초과)\s*(?:의\s*)?(?:사업장|사업체|기업|소상공인|업체)/);
    if (!m) continue;
    const n = Number(m[1]), w = m[2]!;
    const value = w === "미만" ? n - 1 : w === "초과" ? n + 1 : n;
    rules.push({ scope: "business", field: "employees", operator: w === "미만" || w === "이하" ? "lte" : "gte", value, label: `직원 ${n}명 ${w}` });
    add("employees", `직원 ${n}명 ${w}`, s); break;
  }
  // 업력
  for (const s of list) {
    const m = s.match(/(?:업력|창업\s*후?|개업\s*후?|사업\s*개시(?:일(?:로부터)?)?|설립\s*후?)\s*(\d+)\s*년\s*(이내|미만|이하|이상|초과|경과)/);
    if (!m) continue;
    const n = Number(m[1]), w = m[2]!;
    const base = new Date(now.getTime() + 9 * 3600000); base.setUTCFullYear(base.getUTCFullYear() - n);
    const young = w === "이내" || w === "미만" || w === "이하";
    rules.push({ scope: "business", field: "openedAt", operator: young ? "after" : "before", value: base.toISOString().slice(0, 10), label: `개업 ${n}년 ${w}` });
    add("openedAt", `개업 ${n}년 ${w}`, s);
    cautions.push("업력 기준일(공고일·신청일)은 원문에서 확인해야 합니다.");
    break;
  }
  if (list.some((s) => /예비\s*창업자/.test(s))) cautions.push("예비창업자 관련 조건이 있습니다.");
  // 매출
  for (const s of list) {
    const m = s.match(/매출(?:액|규모)?[^.\n0-9]{0,14}?(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만)\s*원?\s*(이하|미만|이상|초과)/);
    if (!m) continue;
    const value = Math.round(num(m[1]!) * UNIT[m[2]!]!), w = m[3]!;
    rules.push({ scope: "business", field: "revenue", operator: w === "이하" || w === "미만" ? "lte" : "gte", value, label: `연매출 ${m[1]}${m[2]}원 ${w}` });
    add("revenue", `연매출 ${m[1]}${m[2]}원 ${w}`, s); break;
  }
  // 업종: "대상" 문장에 적힌 업종만. "제외" 문장은 규칙으로 만들지 않는다.
  for (const s of list) {
    if (!/대상|영위|업종|자격/.test(s)) continue;
    const hit = INDUSTRY.filter(([, re]) => re.test(s)).map(([k]) => k);
    if (!hit.length) continue;
    if (/제외|불가|제한/.test(s)) { cautions.push("제외 업종이 있습니다. 원문에서 확인해야 합니다."); continue; }
    const specific = hit.filter((k) => k !== "서비스").length ? hit.filter((k) => k !== "서비스" || /서비스업/.test(s.replace(/교육\s*서비스업|사회복지\s*서비스업/g, ""))) : hit;
    rules.push({ scope: "business", field: "industry", operator: "in", value: specific, label: `업종: ${specific.join(", ")}` });
    add("industry", `업종: ${specific.join(", ")}`, s); break;
  }
  // 사업장 형태
  const rent = [title, ...list].find((s) => /임차\s*(?:사업장|점포|소상공인|상가)|임차료\s*지원|임대료\s*지원|임대차\s*계약(?:을|이)?\s*(?:체결|맺)/.test(s));
  if (rent) { rules.push({ scope: "business", field: "premises", operator: "eq", value: "임차", label: "임차 사업장" }); add("premises", "임차 사업장", rent); }
  if (!rules.length) missing.push("세부 자격");

  // 금액: 지원 한도로 적힌 금액만. 매출·예산·자본금은 제외한다.
  let best: { amount: number; s: string } | undefined;
  for (const s of [title, ...list]) for (const m of s.matchAll(MONEY)) {
    const at = m.index ?? 0, before = s.slice(Math.max(0, at - 16), at), after = s.slice(at + m[0].length, at + m[0].length + 10);
    if (/매출|자본|자산|총\s*사업비|예산|규모|공급가|부가세|자부담/.test(before)) continue;
    const limit = /최대|한도|이내|당|까지|지원금|지급/.test(before) || /^\s*(?:이내|한도|까지|씩|\s*지원|\s*지급|을\s*지원|\s*범위)/.test(after);
    if (!limit) continue;
    const amount = amountOf(m);
    if (amount < 10_000 || amount > 100_000_000_000) continue;
    if (!best || amount > best.amount) best = { amount, s };
  }
  if (best) { out.maxAmount = best.amount; add("maxAmount", `최대 ${best.amount.toLocaleString("ko-KR")}원`, best.s); }
  else missing.push("지원 금액");

  // 서류
  const docSentences = list.filter((s) => /서류|제출|구비|첨부|증빙/.test(s));
  const seen = new Set<string>();
  for (const s of docSentences) for (const [name, re] of DOCS) if (!seen.has(name) && re.test(s)) { seen.add(name); out.documents.push(name); add("documents", `서류: ${name}`, s); }
  if (!out.documents.length) missing.push("필요 서류");

  out.confidence = (out.region ? 30 : 0) + (out.maxAmount ? 20 : 0) + (out.endsAt || out.status === "상시 조회" ? 20 : 0) + (rules.length ? 20 : 0) + (out.documents.length ? 10 : 0);
  return out;
}

/** 정리 결과를 공고에 반영한다. 운영자가 이미 채운 값은 덮어쓰지 않는다. */
export function applyExtraction(b: Benefit, x: Extraction): Benefit {
  const generic = (c: string) => /원문에서 검토해야|공식 신청처에서 확인|확인 필요$/.test(c);
  const keepRegion = b.region && b.region !== "관할 확인 필요";
  const fields = new Set(b.rules.map((r) => `${r.scope}.${r.field}`));
  return {
    ...b,
    region: keepRegion ? b.region : x.region ?? b.region,
    rules: [...b.rules, ...x.rules.filter((r) => !fields.has(`${r.scope}.${r.field}`))],
    ...(b.maxAmount ? {} : x.maxAmount ? { maxAmount: x.maxAmount } : {}),
    documents: b.documents.length ? b.documents : x.documents,
    startsAt: b.startsAt || x.startsAt || "", endsAt: b.endsAt || x.endsAt || "",
    status: b.status === "확인 필요" && x.status ? x.status : b.status,
    budgetStatus: b.budgetStatus === "확인 필요" && x.endsAt ? x.budgetStatus : b.budgetStatus,
    checks: [...b.checks.filter((c) => !generic(c)), ...x.missing.map((m) => `${m}: 공식 원문에서 확인 필요`)].slice(0, 50),
    extraction: { confidence: x.confidence, evidence: x.evidence.slice(0, 40), missing: x.missing, cautions: x.cautions, at: new Date().toISOString() },
  };
}
/** 확신이 높고 애매한 점이 없을 때만 자동 공개 후보가 된다. 기본은 꺼져 있다. */
export const autoPublishable = (x: Extraction, env: NodeJS.ProcessEnv = process.env) =>
  env.IROUN_AUTO_PUBLISH_CONFIDENT === "true" && x.confidence >= 80 && x.cautions.length === 0;
