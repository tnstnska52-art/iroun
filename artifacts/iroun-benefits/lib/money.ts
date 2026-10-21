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
const REFUND = /환급|근로\s*장려금|자녀\s*장려금|돌려\s*받|경정\s*청구|보험료\s*(특별\s*)?(지원|환급)|두루누리/;
/** 제목에 이 말이 있으면 통장에 들어오는 돈이다(지원내용에 장비·교육 얘기가 섞여 있어도). */
const CASH_WORD = /장려금|보조금|지원금|수당|급여|보상금/;
const VOUCHER = /바우처|크레딧|감면|면제|할인|포인트\s*(제|지급|적립|지원)|상품권|지역\s*화폐|캐시백|페이백|쿠폰|요금\s*(특별\s*)?(지원|경감)/;
const PURCHASE = /시스템\s*구축|장비|기기|설비|시설\s*(개선|보수|구축)|냉장고|문\s*달기|설치|교체|개보수|도입|구입|(?<!(공공|직접|시범)\s?)구매|고효율|리모델링|인테리어|간판|키오스크|스마트\s*상점|기술\s*보급|환경\s*개선|점포\s*개선|자부담/;
const SERVICE = /전시\s*\(?\s*박람\s*\)?\s*회|출전|클리닝|위생\s*컨설팅|가맹점\s*등록|엑스포|디자인\s*개발|적립\s*운영|인증서|가맹점\s*모집|공동\s*활용|장비\s*사용|사용\s*안내|특판|기획전|팝업|환영\s*행사|행사\s*지원|기술\s*이전|협약\s*파트너|파트너사|인재\s*채움|알선|고용\s*서비스|인큐베이팅|구축\s*[·ㆍ]?\s*운영|Back-?Office|Back-?Off|안전\s*(동행|보건)|촬영|정보\s*제공|직접\s*구매|공공\s*구매|판매장|면세장|성장몰|지사화|팁스|TIPS|법무|지원단|계절\s*학기|기술\s*지원|활용\s*지원|시험\s*장비|인력\s*양성|양성\s*대학|특화\s*지원\s*센터|메이커|고용\s*허가|매칭|비즈니스|통합\s*공고|보육|신탁|직업\s*능력|능력\s*개발|산정|조사|사관학교|자문|참여\s*팀|컴퍼니\s*빌딩|검사|수준\s*확인|밋업|네트워킹|설명회|간담회|포럼|세미나|컨퍼런스|살롱|점검|고용\s*추천|전환\s*추천|공모전|아이디어\s*공모|지정\s*공모|품질\s*대상|시상|어워드|포상|훈련|인정\s*신청|인증|세일|페스타|축제|피해\s*구제|상담|입주|공간|센터|대피소|법률|세무|노무|투자\s*연계|투자\s*유치|선정\s*(모집|공고|계획)|우수\s*기업|자율\s*개선|교육|컨설팅|멘토링|코칭|박람회|전시회|산업\s*대전|참가\s*지원|경진\s*대회|챌린지|개척단|오픈\s*이노베이션|액셀러레이팅|창업\s*패키지|(신규\s*)?지정\s*(계획|모집|신청)|데모\s*데이|Demo\s*Day|IR\b|판로|마케팅|홍보|아카데미|역량|진단|입점|해외\s*진출|상담회|기술\s*개발|R&D|연구\s*개발/;

/** 지원내용에 구입비·설치비 보조라고 적혀 있어야 구입비 보조로 본다(장비 얘기만 있는 공고는 서비스일 때가 많다). */
const PURCHASE_COST = /(구입|구매|설치|구축|도입|교체|시공|개선)\s*비|비용\s*(의\s*)?\d+\s*%|\d+\s*%\s*(이내\s*)?(지원|보조)|자부담|보조\s*금|보조\s*비율/;
const SERVICE_CATEGORY = /^(기술|기술개발\(R&D\)|행사ㆍ네트워크|멘토링ㆍ컨설팅ㆍ교육|창업교육)$/;

/** 공고가 주는 돈의 형태 */
export function moneyType(b: Pick<Benefit, 'kind' | 'title' | 'category' | 'support' | 'summary'>): MoneyType {
  // 분야(category)는 '교육'·'마케팅'처럼 넓게 붙어서, 융자를 알아볼 때만 쓰고 나머지는 제목으로 판단한다.
  const head = b.title.replace(NEG, '');
  const body = `${b.support ?? ''} ${b.summary ?? ''}`.replace(NEG, '');
  if (LOAN.test(`${head} ${b.category}`) || LOAN.test(body) && !/지원금|보조금|장려금|수당/.test(head)) return 'loan';
  if (b.kind === '환급금' || REFUND.test(head)) return 'refund';
  if (CASH_WORD.test(head)) return 'cash';
  // '상품권 가맹점 등록'처럼 가맹점으로 등록하는 사업은 돈을 받는 게 아니다.
  if (/가맹점\s*(등록|모집|가입)/.test(head)) return 'service';
  if (VOUCHER.test(head)) return 'voucher';
  // 제목에 센터·상담·활용 같은 말이 있으면 장비 얘기가 있어도 서비스다(예: '센터 보유 시험장비 활용 지원').
  if (SERVICE.test(head)) return 'service';
  if (PURCHASE.test(head)) return 'purchase';
  // 기술개발·행사·교육 분야 공고는 제목에 돈 얘기가 없으면 실증·인증·네트워킹 같은 서비스다.
  if (SERVICE_CATEGORY.test(b.category ?? '')) return 'service';
  // 제목만으로 모를 때는 지원내용을 본다.
  // '무료로 촬영해 드려요'처럼 무료 제공이라고만 적힌 사업은 서비스다.
  if (/무료|무상/.test(body) && !CASH_WORD.test(head)) return 'service';
  if (VOUCHER.test(body)) return 'voucher';
  if (PURCHASE_COST.test(body)) return 'purchase';
  if (SERVICE.test(body) && !/지원금|보조금|장려금|수당|인건비|임차료/.test(`${head} ${body}`)) return 'service';
  return 'cash';
}

export const isLoan = (b: Parameters<typeof moneyType>[0]) => moneyType(b) === 'loan';
export const moneyRank = (b: Parameters<typeof moneyType>[0]) => MONEY_RANK[moneyType(b)];
/** 통장에 바로 들어오는 돈(현금 지원·환급) */
export const paysCash = (b: Parameters<typeof moneyType>[0]) => moneyRank(b) === 0;
