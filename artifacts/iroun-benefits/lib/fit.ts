import type { Benefit } from '@workspace/api-client-react';
import { DISTRICTS } from './regions';

/** 매장·현장 중심 업종. 수출·기술개발 공고는 해당 사업이 있는지 확인이 필요하다. */
const LOCAL_INDUSTRIES = ['음식점', '숙박', '서비스', '교육', '보건·복지', '운수', '건설'];
const FAR_CATEGORY = /^(수출|판로ㆍ해외진출|기술|기술개발\(R&D\))$/;
/**
 * 업종 관문. 공고 자격에 업종 규칙이 없어도 공고가 다른 업종을 위한 것이면 걸러낸다.
 *  - out: 다른 업종 대상(AI가 정한 관련 업종이 1~2개인데 고른 업종이 없음, 농림축산어업 분야인데 농림어업이 아님)
 *  - check: 매장 업종에 수출·기술개발 공고 → '조건 일치'로 세지 않고 확인 필요로 둔다
 */
/** 제목에 이런 말이 있으면 그 업종을 위한 공고일 가능성이 높다. 다른 업종이면 확인 필요로 둔다. */
const INDUSTRY_HINTS: [RegExp, string[]][] = [
  [/방송|언론|취재|영상\s*제작|콘텐츠|게임|웹툰/, ['정보통신', '서비스']],
  [/농업|농가|농촌|어업|어가|어촌|축산|임업|산림|수산|양식|귀농/, ['농림어업']],
  [/제조|공장|소공인|뿌리\s*기업|스마트\s*공장|인버터|압축기|변압기|사출|공정|모빌리티|자동차\s*부품/, ['제조']],
  [/작업\s*환경\s*측정/, ['제조', '건설']],
  [/기술\s*보호|기술\s*유출/, ['제조', '정보통신']],
  [/쌀|꿀|양봉|발효|축산물|수산물|수산\s*식품|농산물|농식품|식품\s*(소재|가공|기능성)|가공\s*산업/, ['농림어업']],
  [/신문|잡지|출판/, ['정보통신', '서비스']],
  [/관광|숙박|호텔|펜션|마이스|MICE/, ['숙박', '서비스']],
  [/의료|병원|의원|약국|요양/, ['보건·복지']],
  [/건설|건축|공사용/, ['건설']],
  [/수출|해외\s*(진출|마케팅|시장|인증|물류)|글로벌|물류\s*바우처|중동/, ['제조', '도소매', '정보통신', '농림어업']],
  [/물류|운송|화물|택시|버스/, ['운수', '도소매']],
];
const STRONG_HINTS: [RegExp, string[]][] = [
  [/신문사|신문\s*우송/, ['정보통신']],
  [/매출\s*채권/, ['제조', '도소매', '건설', '정보통신']],
  [/축산물\s*판매|정육/, ['도소매', '농림어업', '음식점']],
  [/택시|화물\s*운송/, ['운수']],
  [/학원|교습소/, ['교육']],
  [/약국|의원|병원/, ['보건·복지']],
];
const SECTOR = /광산|광업|석유\s*화학|철강|어선|양식|원양|어가|채종|종자|퇴비|비료|수산|쌀|꿀|벌꿀|화장품|뷰티|바이오|의료\s*기기|반도체|조선|해양|항공|방산|원자력|수소|이차\s*전지|배터리|자동차|로봇|드론|섬유|패션|가구|기계|금형|도정|양곡/;
/** 매장 업종에 벤처·스타트업 전용 공고는 확인 필요 */
const VENTURE = /벤처|스타트업|딥테크|예비\s*창업|창업\s*기업|창업\s*도약|창업\s*패키지/;
export function industryGate(b: Pick<Benefit, 'category'> & { title?: string; fit?: { industries?: string[] } }, industry?: string): 'ok' | 'check' | 'out' {
  const title = b.title ?? '';
  if (!industry) return 'ok';
  // 업종을 '기타'로 고르면 특정 업종 공고는 조건 일치로 세지 않는다.
  if (industry === '기타') return STRONG_HINTS.some(([re]) => re.test(title)) || INDUSTRY_HINTS.some(([re]) => re.test(title)) || SECTOR.test(title) || (b.fit?.industries?.length ?? 0) > 0 || b.category === '농림축산어업' ? 'check' : 'ok';
  // 제목에 업종이 분명히 적힌 공고(예: 축산물판매업소)는 AI가 정한 관련 업종보다 제목을 따른다.
  const strong = STRONG_HINTS.find(([re]) => re.test(title));
  if (strong) return strong[1].includes(industry) ? 'ok' : 'out';
  // 화장품·자동차부품·수산처럼 세부 산업 공고는 업종이 맞아도 그 산업인지 확인이 필요하다.
  if (SECTOR.test(title)) return (b.fit?.industries?.length && !b.fit.industries.includes(industry)) ? 'out' : 'check';
  if (b.fit?.industries?.includes(industry)) return 'ok';
  const inds = b.fit?.industries ?? [];
  if (inds.length) return inds.includes(industry) ? 'ok' : inds.length <= 2 ? 'out' : 'check';
  if (b.category === '농림축산어업') return industry === '농림어업' ? 'ok' : 'out';
  if (FAR_CATEGORY.test(b.category) && LOCAL_INDUSTRIES.includes(industry)) return 'check';
  if (INDUSTRY_HINTS.some(([re, inds]) => re.test(title) && !inds.includes(industry))) return 'check';
  if (VENTURE.test(title) && [...LOCAL_INDUSTRIES, '도소매'].includes(industry)) return 'check';
  // 화장품·바이오·조선처럼 세부 산업 공고는 우리 업종이 맞아도 그 산업인지 확인이 필요하다.
  if (SECTOR.test(title)) return 'check';
  return 'ok';
}

/** 직원을 두고 있어야 받는 사업(채용·고용유지·근로자 복지). 자영업자 본인 보험료 지원은 뺀다. */
const EMPLOYER = /산재\s*예방|클린\s*사업장|안전\s*보건|내일\s*채움|가족\s*친화|재택\s*근무|어린이집|일\s*생활|워라밸|인재|대체\s*인력|일\s*경험|계절\s*학기|고용|취업|사업주|근로\s*복지|채용|인턴|근로자|직원|인력|퇴직\s*연금|정규직|육아\s*휴직|출산|작업\s*환경|산재|일자리/;
const SELF = /자영업자|1인|대표자|본인|보험료/;
/** 4대보험 직원이 없다고 답한 사업장에 직원 고용 사업을 빼는지 */
export function needsEmployees(b: Pick<Benefit, 'title'>, employeeBand?: string, employees?: number): boolean {
  const none = employeeBand === '없음' || employees === 0;
  // '일자리창출 사회보험료 지원'처럼 새로 뽑은 직원 몫을 주는 사업은 보험료라도 직원이 있어야 한다.
  const hiring = /일자리\s*창출|신규\s*채용|채용/.test(b.title);
  return none && EMPLOYER.test(b.title) && (!SELF.test(b.title) || hiring);
}

const WOMAN_ONLY = /여성\s*(기업|벤처|창업|대표|CEO|경제인|기업인)/;
const SPECIAL_OWNER = /북한\s*이탈|새터민|사회적\s*가치|사회\s*연대|사회적\s*(기업|경제)|협동\s*조합|마을\s*기업|비영리|보훈|국가\s*유공|다문화|한부모|장애인|장애\s*(기업|창업)|보조\s*공학/;
/** 특정한 일이 생겼을 때만 받는 사업(산재·휴직·고용조정·폐업·재기). 평소 사업장에는 '조건 일치'로 세지 않는다. */
const SITUATIONAL = /기업\s*이전|이전\s*기업|공동\s*구매|협업\s*활성화|협업체|산재|고용\s*유지|육아\s*휴직|출산|실업\s*급여|사업\s*정리|폐업|재기|휴업|재해|피해\s*(지원|복구)|위기|부담금/;
/**
 * 대표자 자격 관문.
 *  - out: 여성 기업 전용인데 여성 대표가 아니라고 답함
 *  - check: 북한이탈주민·보훈·장애인 사업자처럼 특정 대표자 대상 → '조건 일치'로 세지 않는다
 */
export function ownerGate(b: Pick<Benefit, 'title'>, womanOwned?: string): 'ok' | 'check' | 'out' {
  if (WOMAN_ONLY.test(b.title)) return womanOwned === '아니오' ? 'out' : womanOwned === '예' ? 'ok' : 'check';
  return SPECIAL_OWNER.test(b.title) || SITUATIONAL.test(b.title) ? 'check' : 'ok';
}

/** 같은 사업이 여러 출처(기업마당·보조금24 등)에서 들어온 중복을 알아보는 열쇠 */
export function sameProgramKey(title: string): string {
  return title.replace(/\[[^\]]*\]|\([^)]*\)|\d{4}\s*년|제?\s*\d+\s*(차|회|기|분기)|하반기|상반기|공고|사업|모집|참여\s*기업|신청|안내|지원|금|[\s·ㆍ,./-]/g, '');
}
/** 앞에 있는 것(우선순위가 높은 것)만 남기고 같은 사업의 중복을 뺀다 */
export function dedupePrograms<T extends { benefit: Pick<Benefit, 'title'> }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => { const k = sameProgramKey(x.benefit.title); if (!k || seen.has(k)) return !k; seen.add(k); return true; });
}

/** 창업 초기 전용 공고(예비·초기·신규 창업) */
const EARLY_STAGE = /예비\s*창업|초기\s*창업|창업\s*초기|신규\s*창업|창업자\s*초기|청년\s*창업|창업\s*\d\s*년\s*(이내|미만)/;
/**
 * 업력 관문. 공고 자격에 업력 규칙이 없어도 제목이 창업 초기 전용이면 개업 3년이 넘은 사업장은 뺀다.
 */
export function stageGate(b: Pick<Benefit, 'title'>, openedYear?: number, now = new Date()): 'ok' | 'out' {
  if (!openedYear) return 'ok';
  const year = new Date(now.getTime() + 9 * 3600000).getUTCFullYear();
  return EARLY_STAGE.test(b.title) && openedYear <= year - 3 ? 'out' : 'ok';
}

/**
 * 소상공인 규모 관문. 공고가 소상공인·자영업자 대상인데 고객이 그 규모를 넘으면 뺀다.
 * 소상공인: 상시근로자 5명 미만(제조·건설·운수는 10명 미만). 자영업자 공고는 개인사업자만.
 */
export function smallBizGate(b: Pick<Benefit, 'title' | 'summary'>, x: { employeeBand?: string; industry?: string; entity?: string }): 'ok' | 'out' {
  const text = `${b.title} ${b.summary ?? ''}`;
  const forSmall = /소상공인|자영업자|영세/.test(text) && !/중소\s*기업|중소\s*사업장|중견/.test(text);
  if (!forSmall) return 'ok';
  if (/자영업자/.test(text) && (!/소상공인/.test(text) || /자영업자\s*고용\s*보험/.test(text) && !/사업주|산재/.test(text)) && x.entity === '법인') return 'out';
  const band = x.employeeBand;
  if (!band || band === '없음' || band === '1~4명') return 'ok';
  if (band === '5~9명') return ['제조', '건설', '운수'].includes(x.industry ?? '') ? 'ok' : 'out';
  return 'out';
}

const EASY_AUTO = /노란우산|보험료|수수료|에너지\s*바우처|경영\s*안정\s*바우처|감면|면제|요금|캐시백|페이백|환급|희망\s*장려금|가입\s*장려금|면세유|유가\s*연동|상품권|지역\s*화폐|민생/;
const HIRING = /채용|정규직|전환|인턴|일\s*경험|고용\s*창출|신규\s*고용|청년\s*일자리|시니어|중장년|노인|고령자|출산|육아|장애인/;
/**
 * 받기 쉬운 정도. 0: 조건만 맞으면 신청만으로 받는 돈(노란우산 장려금·보험료·수수료·바우처·감면),
 * 1: 일반 사업, 2: 직원을 새로 뽑거나 전환해야 받는 돈. 목록 위쪽에 0을 먼저 보여준다.
 */
export function easeOf(b: Pick<Benefit, 'title'>): 0 | 1 | 2 {
  if (EASY_AUTO.test(b.title)) return 0;
  return HIRING.test(b.title) ? 2 : 1;
}

const REV_RANGE: Record<string, [number, number]> = { '5천만 원 미만': [0, 5e7 - 1], '5천만~1억 원': [5e7, 1e8 - 1], '1억~3억 원': [1e8, 3e8 - 1], '3억~5억 원': [3e8, 5e8 - 1], '5억~10억 원': [5e8, 1e9 - 1], '10억 원 이상': [1e9, Infinity], '1억 원 미만': [0, 1e8 - 1], '3억~10억 원': [3e8, 1e9 - 1] };
const EMP_RANGE: Record<string, [number, number]> = { '없음': [0, 0], '1~4명': [1, 4], '5~9명': [5, 9], '10~29명': [10, 29], '30명 이상': [30, Infinity] };
/**
 * 공고 요약에 적힌 매출·직원 수 한도. 자격 규칙으로 뽑히지 않았을 때만 쓴다.
 * 예) "연매출 3억원 이하 소상공인", "고용보험 피보험자 5인 이상 기업"
 */
export function textLimitGate(b: Pick<Benefit, 'summary' | 'rules'>, x: { revenue?: string; employeeBand?: string; openedYear?: number }, now = new Date()): 'ok' | 'check' | 'out' {
  const text = b.summary ?? '';
  // "'25년 매출액 0원 초과"처럼 작년 매출이 있어야 하는데 올해 개업했으면 제외
  const year = new Date(now.getTime() + 9 * 3600000).getUTCFullYear();
  const last = String(year - 1);
  if (x.openedYear && x.openedYear >= year && new RegExp(`('|‘|’)?${last.slice(2)}년\\s*(연\\s*)?매출|${last}년\\s*(연\\s*)?매출`).test(text)) return 'out';
  const has = (field: string) => (b.rules ?? []).some((r) => r.field === field);
  let res: 'ok' | 'check' | 'out' = 'ok';
  const rv = x.revenue ? REV_RANGE[x.revenue] : undefined;
  const mr = text.match(/매출(?:액)?\s*(?:이|은|가)?\s*(\d+(?:\.\d+)?)\s*억\s*원?\s*(이하|미만)/);
  if (mr && rv && !has('revenue')) {
    const cap = parseFloat(mr[1]) * 1e8 - (mr[2] === '미만' ? 1 : 0);
    if (rv[0] > cap) return 'out';
    if (rv[1] > cap) res = 'check';
  }
  const ev = x.employeeBand ? EMP_RANGE[x.employeeBand] : undefined;
  const me = text.match(/(?:근로자|노동자|직원|피보험자)\s*(?:수\s*)?(?:가\s*)?(\d+)\s*(?:인|명)\s*(이상|미만|이하)/);
  if (me && ev && !has('employees')) {
    const n = parseInt(me[1], 10);
    const [lo, hi] = me[2] === '이상' ? [n, Infinity] : [0, me[2] === '미만' ? n - 1 : n];
    if (ev[1] < lo || ev[0] > hi) return 'out';
    if (ev[0] < lo || ev[1] > hi) res = 'check';
  }
  return res;
}

/** 공고 요약에 적힌 신청 대상이 조직(농협·영농조합·협동조합·사회적기업 등)이면 개별 사업장은 확인 필요 */
const ORG_TARGET = /농협|영농\s*조합|농업\s*(회사\s*)?법인|협동\s*조합|생산자\s*단체|유통\s*(법인|조직)|산지\s*유통|사회적\s*기업|예비\s*사회적\s*기업/;
export function orgTargetGate(b: Pick<Benefit, 'summary'>): 'ok' | 'check' {
  return ORG_TARGET.test(b.summary ?? '') && !/소상공인|개인\s*사업자|중소\s*기업/.test(b.summary ?? '') ? 'check' : 'ok';
}

/**
 * 시·군·구 관문. 공고 지역이 시·도까지만 적혀 있어도 요약에 "거창군 소재"처럼 시·군·구가 적혀 있으면 그 시·군·구만 해당한다.
 */
export function districtGate(b: Pick<Benefit, 'title' | 'summary'>, province?: string, district?: string): 'ok' | 'out' {
  if (!province || !district) return 'ok';
  const list = DISTRICTS[province] ?? [];
  const text = `${b.title} ${b.summary ?? ''}`;
  const named = new Set<string>();
  const head = b.title.match(/^\s*\[[^\]]+\]\s*((?:[가-힣]+(?:시|군|구)\s*[ㆍ·,]?\s*)+)/);
  if (head) for (const d of head[1].match(/[가-힣]+(?:시|군|구)/g) ?? []) if (list.includes(d)) named.add(d);
  for (const m of text.matchAll(/([가-힣]{1,4}(?:시|군|구))\s*(?:소재|내|관내|거주|지역\s*(?:소재|내))/g)) if (list.includes(m[1])) named.add(m[1]);
  if (!named.size || named.has(district)) return 'ok';
  return 'out';
}
