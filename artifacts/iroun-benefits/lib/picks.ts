/**
 * 오늘의 추천: 오늘 바로 신청할 수 있고, 통장에 돈이 들어오며, 받기 쉬운 지원 5건.
 * 매번 지금 공고 자료로 다시 고르므로, 마감된 것은 빠지고 새로 열린 것이 들어온다.
 * "받기 쉬움"은 조건이 맞는지, 준비할 것이 적은지로 매긴 순서다. 선정 확률을 계산한 값이 아니다.
 */
import type { Benefit } from '@workspace/api-client-react';
import { difficulty } from '@/lib/difficulty';
import { daysLeft } from '@/lib/util';
import { moneyRank, moneyType } from '@/lib/money';

type Item = { benefit: Benefit; result: string };
// 민생지원금, 전기·가스 요금 지원, 캐시백처럼 대부분 조건만 맞으면 받는 유형.
// '전기', '에너지' 한 단어만으로는 전기차·에너지 기술개발 같은 어려운 사업까지 잡혀서 요금·비용으로 좁힌다.
export const EASY_MONEY = /민생|전기\s*요금|가스\s*요금|에너지\s*(바우처|비용)|요금\s*(지원|감면|경감)|캐시백|페이백|환급|바우처|상품권|지역\s*화폐|쿠폰|감면|장려금|수당/;

/** 오늘 접수 중인지: 접수 상태가 확인됐고, 시작일이 지났고, 마감 전이며, 예산이 남아 있다. */
export function openToday(b: Benefit, now = Date.now()) {
  if (b.status !== '접수 중' && b.status !== '상시 조회') return false;
  if (b.budgetStatus === '소진') return false;
  if (b.startsAt && Number.isFinite(Date.parse(b.startsAt)) && Date.parse(b.startsAt) > now) return false;
  const left = daysLeft(b.endsAt);
  return left === null || left >= 0;
}

/**
 * 놓치기 쉬운 지원금 카드 5건.
 * 오늘 접수 중이고 손에 돈이 들어오는 것(현금 지원·바우처)만 고른다. 환급금은 따로 카드가 있어서 뺀다.
 * 순서: 통장 입금 → 조건 일치 → 신청이 쉬움 → 몰라서 못 받는 유형 → 마감이 가까움.
 */
export function todayPicks(items: Item[], count = 5): Item[] {
  return items
    .filter((x) => openToday(x.benefit) && moneyRank(x.benefit) <= 1 && moneyType(x.benefit) !== 'refund')
    .map((x) => {
      const b = x.benefit;
      const score = (moneyRank(b) === 0 ? 50 : 20) + (x.result === '조건 일치' ? 40 : 0) + (5 - difficulty(b)) * 10 + (EASY_MONEY.test(`${b.title} ${b.category}`) ? 15 : 0);
      return { x, score, left: daysLeft(b.endsAt) ?? 9999 };
    })
    .sort((p, q) => q.score - p.score || p.left - q.left)
    .slice(0, count)
    .map((p) => p.x);
}

/**
 * 놓치기 쉬운 지원금: 몰라서 안 받는 경우가 많은 것.
 * 환급금, 상시로 신청받는 것, 민생지원금·요금 감면·바우처·캐시백 같은 것, 준비할 것이 적은 것.
 */
export function easyToMiss(b: Benefit) {
  return b.kind === '환급금' || b.status === '상시 조회' || EASY_MONEY.test(`${b.title} ${b.category}`) || difficulty(b) <= 1;
}

/**
 * 환급금 카드에 넣을 것: 실제로 돌려받는 돈만.
 * 공고 종류가 환급금이거나 국세청 근로·자녀장려금, 경정청구처럼 신청하면 돌려받는 것.
 * 고용장려금·희망장려금처럼 '장려금'이 붙어도 새로 주는 지원금은 넣지 않는다.
 */
export function refundLike(b: Benefit) {
  return moneyType(b) === 'refund';
}
