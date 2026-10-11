/**
 * 정책자금 화면 자료.
 * FUNDS 는 소상공인정책자금 누리집(ols.semas.or.kr)의 '정책자금 한눈에 보기'와 접수 목록을
 * CHECKED_AT 날짜에 옮겨 적은 것이다. 금리는 분기마다, 접수 상태는 수시로 바뀌므로
 * 자동 수집을 연결하기 전까지는 사람이 주기적으로 다시 확인해야 한다. 지어낸 값은 넣지 않는다.
 */
export const FUND_SOURCE = 'https://ols.semas.or.kr/ols/man/SMAN018M/page.do';
export const FUND_CHECKED_AT = '2026-10-12';
export const FUND_BASE_RATE = '2026년 4분기 기준금리 4.12% · 분기마다 바뀜';
/** 회사가 밝힌 누적 상담 건수. 근거 자료를 회사가 보관해야 한다. */
export const CONSULT_COUNT = 3024;

export type Fund = { id: string; kind: '직접대출' | '대리대출'; name: string; target: string; limit: string; rate: string; term: string; status: '접수 중' | '접수 예정'; period: string };
export const FUNDS: Fund[] = [
  { id: 'd-hyeoksin', kind: '직접대출', name: '혁신성장촉진자금', target: '수출·매출 성장·스마트공장 등 혁신형, 또는 스마트기술·백년소상공인 등 일반형 기준을 충족한 소상공인', limit: '일반형 운전 1억 · 시설 5억 / 혁신형 운전 2억 · 시설 10억', rate: '기준금리 + 0.4%p', term: '운전 5년, 시설 8년', status: '접수 중', period: '2026.1.12 ~ 자금 소진 시' },
  { id: 'd-sangsaeng', kind: '직접대출', name: '상생성장지원자금', target: 'TOPS 선정, 상생협약 플랫폼 입점, 브랜드 소상공인 점프업 선정 소상공인', limit: '일반형 운전 7천만 / 성장형 운전 1억 · 시설 5억 / 도약형 운전 2억 · 시설 10억', rate: '기준금리 + 0.4%p', term: '운전 5년, 시설 8년', status: '접수 중', period: '2026.1.12 ~ 자금 소진 시' },
  { id: 'd-matching', kind: '직접대출', name: '민간투자연계형 매칭융자', target: '주관기관에서 투자금을 받고 선투자 추천서를 받은 소상공인', limit: '5억', rate: '기준금리 + 0.4%p', term: '8년', status: '접수 중', period: '2026.1.12 ~ 자금 소진 시' },
  { id: 'd-homeplus', kind: '직접대출', name: '일시적경영애로자금 (홈플러스 피해)', target: '홈플러스 입점·거래업체로 지정 기간 내 영업·거래 사실이 확인된 소상공인', limit: '1억', rate: '기준금리 - 0.5%p', term: '5년 (거치 2년)', status: '접수 중', period: '2026.7.15 ~ 자금 소진 시 (공지상 10.30까지)' },
  { id: 'd-sinyong', kind: '직접대출', name: '신용취약소상공인자금', target: '신용관리 교육을 이수한 중·저신용(NCB 839점 이하) 소상공인', limit: '3천만', rate: '기준금리 + 1.6%p', term: '5년 (거치 2년)', status: '접수 예정', period: '4분기 10.12~13 접수 안내' },
  { id: 'd-aero', kind: '직접대출', name: '일시적경영애로자금', target: '연매출 1억 4백만 원 미만, 업력 7년 미만, 일시적 경영애로가 있는 소상공인', limit: '7천만', rate: '기준금리 + 0.0%p', term: '5년 (거치 2년)', status: '접수 예정', period: '4분기 10.26부터 접수 안내' },
  { id: 'd-jaedojeon', kind: '직접대출', name: '재도전특별자금', target: '재창업 준비·초기, 채무조정 등 유형별 요건을 충족한 소상공인', limit: '일반형 7천만 / 희망형 1억 / 도약형 2억', rate: '기준금리 + 가산금리 (유형별로 다름)', term: '5년 (거치 2년)', status: '접수 예정', period: '4분기 10.26부터 접수 안내' },
  { id: 'a-ilban', kind: '대리대출', name: '일반경영안정자금', target: '업력과 무관한 소상공인', limit: '7천만', rate: '기준금리 + 0.6%p', term: '5년 (거치 2년)', status: '접수 중', period: '4분기 2026.10.6 ~ 12.23 (예산 소진 시 마감)' },
  { id: 'a-cheongnyeon', kind: '대리대출', name: '청년고용연계자금', target: '업력 3년 미만 청년(만 39세 이하) 소상공인, 청년 근로자가 과반이거나 최근 1년 내 청년을 고용·유지 중인 소상공인', limit: '7천만', rate: '기준금리 + 0.0%p', term: '5년 (거치 2년)', status: '접수 중', period: '4분기 2026.10.6 ~ 12.23 (예산 소진 시 마감)' },
  { id: 'a-sogongin', kind: '대리대출', name: '소공인특화자금', target: '제조업을 하는 상시근로자 10인 미만 소공인', limit: '운전 1억 · 시설 5억', rate: '기준금리 + 0.6%p', term: '운전 5년, 시설 8년', status: '접수 중', period: '2026.1.5 ~ 자금 소진 시' },
  { id: 'a-daehwan', kind: '대리대출', name: '소상공인 대환대출', target: '중·저신용 소상공인의 고금리 대출 또는 만기연장이 어려운 대출', limit: '5천만', rate: '고정금리 (공단 안내 확인)', term: '10년', status: '접수 중', period: '2026.1.5 ~ 자금 소진 시' },
];

export const THIS_YEAR = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
export const OPEN_YEARS = [...Array.from({ length: THIS_YEAR - 2009 }, (_, i) => `${THIS_YEAR - i}년`), '2009년 이전'];
export const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
export const REVENUE_YEARS = [THIS_YEAR - 1, THIS_YEAR - 2, THIS_YEAR - 3];
export const REVENUE_BANDS = ['매출 없음', '5천만 원 미만', '5천만~1억 원', '1억~3억 원', '3억~5억 원', '5억~10억 원', '10억 원 이상'];
export const CREDIT_BANDS = ['900점 이상', '800~899점', '700~799점', '600~699점', '500~599점', '500점 미만', '모름'];
export const LENDERS = ['은행', '소상공인진흥공단', '신용보증재단', '신용보증기금', '기술보증기금', '카드·캐피탈', '저축은행', '기타'];
export const LOAN_BANDS = ['1천만 원 미만', '1천만~3천만 원', '3천만~5천만 원', '5천만~1억 원', '1억~3억 원', '3억 원 이상'];
export const DEPOSIT_BANDS = ['1천만 원 미만', '1천만~3천만 원', '3천만~5천만 원', '5천만~1억 원', '1억 원 이상'];
export const ASSET_BANDS = ['1억 원 미만', '1억~3억 원', '3억~5억 원', '5억~10억 원', '10억 원 이상'];
export const ISSUES = ['연체 이력', '보증사고 이력', '세금 체납'] as const;
export const FUND_DONE_KEY = 'iroun.fund.submittedAt';
