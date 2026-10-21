import type { Benefit } from '@workspace/api-client-react';

/** 매장·현장 중심 업종. 수출·기술개발 공고는 해당 사업이 있는지 확인이 필요하다. */
const LOCAL_INDUSTRIES = ['음식점', '숙박', '서비스', '교육', '보건·복지', '운수', '건설'];
const FAR_CATEGORY = /^(수출|판로ㆍ해외진출|기술|기술개발\(R&D\))$/;
/**
 * 업종 관문. 공고 자격에 업종 규칙이 없어도 공고가 다른 업종을 위한 것이면 걸러낸다.
 *  - out: 다른 업종 대상(AI가 정한 관련 업종이 1~2개인데 고른 업종이 없음, 농림축산어업 분야인데 농림어업이 아님)
 *  - check: 매장 업종에 수출·기술개발 공고 → '조건 일치'로 세지 않고 확인 필요로 둔다
 */
export function industryGate(b: Pick<Benefit, 'category'> & { fit?: { industries?: string[] } }, industry?: string): 'ok' | 'check' | 'out' {
  if (!industry || industry === '기타') return 'ok';
  const inds = b.fit?.industries ?? [];
  if (inds.length) return inds.includes(industry) ? 'ok' : inds.length <= 2 ? 'out' : 'check';
  if (b.category === '농림축산어업') return industry === '농림어업' ? 'ok' : 'out';
  if (FAR_CATEGORY.test(b.category) && LOCAL_INDUSTRIES.includes(industry)) return 'check';
  return 'ok';
}

/** 직원을 두고 있어야 받는 사업(채용·고용유지·근로자 복지). 자영업자 본인 보험료 지원은 뺀다. */
const EMPLOYER = /재택\s*근무|어린이집|일\s*생활|워라밸|인재|대체\s*인력|일\s*경험|계절\s*학기|고용|취업|사업주|근로\s*복지|채용|인턴|근로자|직원|인력|퇴직\s*연금|정규직|육아\s*휴직|출산|작업\s*환경|산재|일자리/;
const SELF = /자영업자|1인|대표자|본인|보험료/;
/** 4대보험 직원이 없다고 답한 사업장에 직원 고용 사업을 빼는지 */
export function needsEmployees(b: Pick<Benefit, 'title'>, employeeBand?: string, employees?: number): boolean {
  const none = employeeBand === '없음' || employees === 0;
  return none && EMPLOYER.test(b.title) && !SELF.test(b.title);
}

const WOMAN_ONLY = /여성\s*(기업|벤처|창업|대표|CEO|경제인|기업인)/;
const SPECIAL_OWNER = /북한\s*이탈|새터민|보훈|국가\s*유공|다문화|한부모|장애인\s*(기업|창업|사업자|대표)|장애\s*(기업|창업)|보조\s*공학/;
/**
 * 대표자 자격 관문.
 *  - out: 여성 기업 전용인데 여성 대표가 아니라고 답함
 *  - check: 북한이탈주민·보훈·장애인 사업자처럼 특정 대표자 대상 → '조건 일치'로 세지 않는다
 */
export function ownerGate(b: Pick<Benefit, 'title'>, womanOwned?: string): 'ok' | 'check' | 'out' {
  if (WOMAN_ONLY.test(b.title)) return womanOwned === '아니오' ? 'out' : womanOwned === '예' ? 'ok' : 'check';
  return SPECIAL_OWNER.test(b.title) ? 'check' : 'ok';
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
