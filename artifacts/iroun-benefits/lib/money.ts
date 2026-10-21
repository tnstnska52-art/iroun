/**
 * 공고가 고객 손에 어떤 형태로 돈을 주는지 나눈다.
 * 고객이 가장 받고 싶어 하는 것은 "통장에 바로 들어오는 돈"이라 그 순서로 보여준다.
 *
 *   현금 지원 · 환급  →  바우처 · 요금 감면  →  장비·시설 구입비 보조  →  교육 · 컨설팅 · 판로
 *   저금리 융자 · 대출 · 보증 · 이자 지원은 고객 목록에서 뺀다(정책자금은 회사가 따로 상담한다).
 *
 * 공고 제목·분야·지원내용·요약 글자만 보고 나누는 규칙이라, 운영자가 공고 원문으로 확인하는 것이 최종 기준이다.
 */
import type { Benefit } from '@workspace/api-client-react';

export type MoneyType = 'cash' | 'refund' | 'voucher' | 'purchase' | 'service' | 'loan';

/** 보여주는 순서. 숫자가 작을수록 위. 융자는 목록에 넣지 않는다. */
export const MONEY_RANK: Record<MoneyType, number> = { cash: 0, refund: 0, voucher: 1, purchase: 2, service: 3, loan: 9 };
export const MONEY_LABEL: Record<MoneyType, string> = {
  cash: '통장 입금', refund: '환급', voucher: '바우처·감면', purchase: '구입비 보조', service: '교육·컨설팅', loan: '융자',
};

// "대출·보증료는 제외"처럼 아니라고 적힌 말은 지우고 본다.
const NEG = /(융자|대출|보증료|이자\s*지원|이차\s*보전)(\s*[·,/및]\s*(융자|대출|보증료|이자\s*지원|이차\s*보전))*\s*(은|는|을|를)?\s*(제외|미지원|불포함|지원하지\s*않음)/g;
const LOAN = /융자|대출|이차\s*보전|이자\s*(지원|보전|차액)|특례\s*보증|보증\s*(서|료|수수료|지원)|정책\s*자금|경영\s*안정\s*자금|운전\s*자금|시설\s*자금|육성\s*자금|저금리|대환/;
const REFUND = /환급|근로\s*장려금|자녀\s*장려금|돌려\s*받|경정\s*청구/;
const VOUCHER = /바우처|크레딧|감면|할인|포인트|상품권|지역\s*화폐|캐시백|페이백|쿠폰|요금\s*(특별\s*)?(지원|경감)/;
const PURCHASE = /장비|기기|설비|시설\s*(개선|보수|구축)|냉장고|문\s*달기|설치|교체|개보수|도입|구입|(?<!공공\s?)구매|리모델링|인테리어|간판|키오스크|스마트\s*상점|기술\s*보급|환경\s*개선|점포\s*개선|자부담|매칭/;
const SERVICE = /교육|컨설팅|멘토링|코칭|박람회|전시회|산업\s*대전|참가\s*지원|경진\s*대회|챌린지|개척단|오픈\s*이노베이션|액셀러레이팅|창업\s*패키지|(신규\s*)?지정\s*(계획|모집|신청)|데모\s*데이|Demo\s*Day|IR\b|판로|마케팅|홍보|아카데미|역량|진단|입점|해외\s*진출|상담회|기술\s*개발|R&D|연구\s*개발/;

/** 공고가 주는 돈의 형태 */
export function moneyType(b: Pick<Benefit, 'kind' | 'title' | 'category' | 'support' | 'summary'>): MoneyType {
  // 분야(category)는 '교육'·'마케팅'처럼 넓게 붙어서, 융자를 알아볼 때만 쓰고 나머지는 제목으로 판단한다.
  const head = b.title.replace(NEG, '');
  const body = `${b.support ?? ''} ${b.summary ?? ''}`.replace(NEG, '');
  if (LOAN.test(`${head} ${b.category}`) || LOAN.test(body) && !/지원금|보조금|장려금|수당/.test(head)) return 'loan';
  if (b.kind === '환급금' || REFUND.test(head)) return 'refund';
  if (VOUCHER.test(head)) return 'voucher';
  if (PURCHASE.test(head)) return 'purchase';
  if (SERVICE.test(head)) return 'service';
  // 제목만으로 모를 때는 지원내용을 본다.
  if (VOUCHER.test(body)) return 'voucher';
  if (PURCHASE.test(body)) return 'purchase';
  if (SERVICE.test(body) && !/지원금|보조금|장려금|수당|인건비|임차료/.test(`${head} ${body}`)) return 'service';
  return 'cash';
}

export const isLoan = (b: Parameters<typeof moneyType>[0]) => moneyType(b) === 'loan';
export const moneyRank = (b: Parameters<typeof moneyType>[0]) => MONEY_RANK[moneyType(b)];
/** 통장에 바로 들어오는 돈(현금 지원·환급) */
export const paysCash = (b: Parameters<typeof moneyType>[0]) => moneyRank(b) === 0;
