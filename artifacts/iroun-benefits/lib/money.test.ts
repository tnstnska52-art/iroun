import { describe, expect, it } from 'vitest';
import { moneyType, MONEY_RANK } from './money';

const b = (title: string, extra: Partial<{ kind: '지원금' | '환급금'; category: string; support: string; summary: string }> = {}) =>
  ({ kind: '지원금' as const, category: '경영', support: '', summary: '', title, ...extra });

describe('moneyType: 공고가 주는 돈의 형태', () => {
  it.each([
    ['소상공인 정책자금(일반경영안정자금)', 'loan'],
    ['긴급경영안정자금 지원', 'loan'],
    ['지역신용보증재단 특례보증', 'loan'],
    ['소상공인 대출 이자 지원', 'loan'],
    ['소상공인 신규 고용 인건비 지원', 'cash'],
    ['고용촉진장려금', 'cash'],
    ['노란우산 희망장려금', 'cash'],
    ['민생회복 지원금 (전 국민)', 'cash'],
    ['서울시 청년 자격증 응시료 지원', 'cash'],
    ['소상공인 임차료 지원 (대출·보증료 제외)', 'cash'],
    ['근로장려금 제도 안내', 'refund'],
    ['자녀장려금 제도 안내', 'refund'],
    ['국세환급금 공식 조회 안내', 'refund'],
    ['에너지 비용 부담 완화 바우처', 'voucher'],
    ['소상공인 부담경감 크레딧', 'voucher'],
    ['소상공인 전기요금 특별지원', 'voucher'],
    ['스마트상점 기술보급 지원', 'purchase'],
    ['경기도 소상공인 경영환경 개선 지원', 'purchase'],
    ['소상공인 스마트기기 도입 지원', 'purchase'],
    ['부산 수출 초보기업 해외마케팅 지원', 'service'],
    ['소상공인 온라인 판로 지원', 'service'],
    ['전기차 충전 인프라 기술개발', 'service'],
    ['맞춤식품매장 냉장고 문달기 지원', 'purchase'],
    ['음식점 미세먼지 방지시설 설치 지원사업', 'purchase'],
    ['2026년 하반기 기술ㆍ혁신제품 공공구매 상담회 참여기업 모집 공고', 'service'],
    ['2026 산업단지 오픈이노베이션프로그램 KICXUP 챌린지 2차 모집 공고', 'service'],
    ['초기창업패키지 로켓십 IR 경진대회 참가기업 모집', 'service'],
    ['2026년 대구국제기계산업대전 참가지원 추가모집 공고', 'service'],
  ])('%s → %s', (title, want) => {
    expect(moneyType(b(title))).toBe(want);
  });

  it('분야가 교육이어도 응시료를 돌려주는 사업은 통장 입금', () => {
    expect(moneyType(b('서울시 청년 자격증 응시료 지원', { category: '교육', support: '응시료 실비를 연 1회 지원' }))).toBe('cash');
  });

  it('분야가 금융이면 융자', () => {
    expect(moneyType(b('소상공인 성장 지원', { category: '정책자금' }))).toBe('loan');
  });

  it('공고 종류가 환급금이면 환급', () => {
    expect(moneyType(b('자영업자 고용보험료 지원', { kind: '환급금', category: '보험' }))).toBe('refund');
  });

  it('제목이 애매하면 지원내용으로 융자를 알아본다', () => {
    expect(moneyType(b('소상공인 성장 지원사업', { support: '업체당 최대 7천만원 융자, 연 2.5% 고정금리' }))).toBe('loan');
  });

  it('지원금이라고 적힌 사업은 내용에 대출 언급이 있어도 지원금', () => {
    expect(moneyType(b('재창업 사업화 지원금', { support: '사업화 자금 지원. 대출과 중복 신청 가능' }))).toBe('cash');
  });

  it('통장 입금이 바우처·구입비 보조·교육보다 위', () => {
    expect(MONEY_RANK.cash).toBeLessThan(MONEY_RANK.voucher);
    expect(MONEY_RANK.voucher).toBeLessThan(MONEY_RANK.purchase);
    expect(MONEY_RANK.purchase).toBeLessThan(MONEY_RANK.service);
  });
});
