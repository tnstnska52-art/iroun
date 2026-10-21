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
