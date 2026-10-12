/**
 * 오늘의 추천: 오늘 바로 신청할 수 있고 받기 쉬운 지원 5건.
 * 매번 지금 공고 자료로 다시 고르므로, 마감된 것은 빠지고 새로 열린 것이 들어온다.
 * "받기 쉬움"은 조건이 맞는지, 준비할 것이 적은지로 매긴 순서다. 선정 확률을 계산한 값이 아니다.
 */
import type { Benefit } from '@workspace/api-client-react';
import { difficulty } from '@/lib/difficulty';
import { daysLeft } from '@/lib/util';

type Item = { benefit: Benefit; result: string };
// 민생지원금, 전기·가스 요금 환급, 캐시백처럼 대부분 조건만 맞으면 받는 유형
export const EASY_MONEY = /민생|전기|가스|에너지|요금|캐시백|페이백|환급|바우처|상품권|지역화폐|쿠폰|감면/;

/** 오늘 접수 중인지: 접수 상태가 확인됐고, 시작일이 지났고, 마감 전이며, 예산이 남아 있다. */
export function openToday(b: Benefit, now = Date.now()) {
  if (b.status !== '접수 중' && b.status !== '상시 조회') return false;
  if (b.budgetStatus === '소진') return false;
  if (b.startsAt && Number.isFinite(Date.parse(b.startsAt)) && Date.parse(b.startsAt) > now) return false;
  const left = daysLeft(b.endsAt);
  return left === null || left >= 0;
}

export function todayPicks(items: Item[], count = 5): Item[] {
  return items
    .filter((x) => openToday(x.benefit))
    .map((x) => {
      const b = x.benefit;
      const score = (x.result === '조건 일치' ? 40 : 0) + (5 - difficulty(b)) * 10 + (EASY_MONEY.test(`${b.title} ${b.category}`) ? 25 : 0) + (b.maxAmount ? 5 : 0);
      return { x, score, left: daysLeft(b.endsAt) ?? 9999 };
    })
    // 점수가 같으면 마감이 가까운 것부터
    .sort((p, q) => q.score - p.score || p.left - q.left)
    .slice(0, count)
    .map((p) => p.x);
}

/**
 * 놓치기 쉬운 지원금: 몰라서 안 받는 경우가 많은 것.
 * 환급금, 상시로 신청받는 것, 민생지원금·요금 감면·바우처·캐시백 같은 것, 준비할 것이 적은 것.
 * 홈의 "지금 신청 가능한 지원금"과 겹치지 않게 나누는 기준으로 쓴다.
 */
export function easyToMiss(b: Benefit) {
  return b.kind === '환급금' || b.status === '상시 조회' || EASY_MONEY.test(`${b.title} ${b.category}`) || difficulty(b) <= 1;
}
