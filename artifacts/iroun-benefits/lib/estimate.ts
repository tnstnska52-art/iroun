import { useEffect, useState } from 'react';
import type { Benefit, Profile } from '@workspace/api-client-react';
import { matchBenefit, type Benefit as DomainBenefit, type Profile as DomainProfile } from '../../api-server/src/lib/benefit-domain';
import { loadDraft } from '@/lib/draft';
import { daysLeft, endTime } from '@/lib/util';
import { difficulty } from '@/lib/difficulty';

/** 첫 화면 숫자: 사업자가 1년에 놓치는 지원금 평균(만원). 근거 자료 확인 전에는 실제 앱에 노출하지 않는다. */
export const HEADLINE_STAT = { label: '1년에 놓치는 지원금 평균', manwon: 1273, verified: false };
export const IS_PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
/** 가입 전에 정리본까지 열어 주는 공고 수 */
export const FREE_COUNT = 3;

export interface EstimateItem { benefit: Benefit; result: '조건 일치' | '추가 확인 필요' }
export interface Estimate { items: EstimateItem[]; total: number; counted: number; noAmount: number }

const isClosed = (b: Benefit) => b.status === '마감' || b.budgetStatus === '소진' || (daysLeft(b.endsAt) ?? 0) < 0;
const match = (b: Benefit, p: Profile, at?: Date) => matchBenefit(b as unknown as DomainBenefit, p as unknown as DomainProfile, at).map((m) => m.result);
// 받을 가능성이 높은 것 → 금액이 큰 것 → 신청이 쉬운 것 순서
const order = (x: EstimateItem, y: EstimateItem) =>
  (x.result === y.result ? 0 : x.result === '조건 일치' ? -1 : 1) || (y.benefit.maxAmount ?? 0) - (x.benefit.maxAmount ?? 0) || difficulty(x.benefit) - difficulty(y.benefit);
function summarize(items: EstimateItem[]): Estimate {
  items.sort(order);
  const withAmount = items.filter((x) => (x.benefit.maxAmount ?? 0) > 0);
  return { items, total: withAmount.reduce((n, x) => n + (x.benefit.maxAmount ?? 0), 0), counted: withAmount.length, noAmount: items.length - withAmount.length };
}

/**
 * 받을 수 있는 지원금. 내 조건으로 '대상 제외'가 아닌 진행 중 공고를 모으고,
 * 공고 원문에 적힌 최대 금액만 더한다. 실제 지급액·선정 여부를 뜻하지 않는다.
 */
export function estimate(benefits: Benefit[], profile: Profile): Estimate {
  const items: EstimateItem[] = [];
  for (const b of benefits) {
    if (isClosed(b)) continue;
    const r = match(b, profile);
    if (r.includes('조건 일치')) items.push({ benefit: b, result: '조건 일치' });
    else if (r.includes('추가 확인 필요')) items.push({ benefit: b, result: '추가 확인 필요' });
  }
  return summarize(items);
}

/**
 * 놓친 지원금. 이미 마감된 공고 중 내 조건(지역·업종·직원 수 등)과 어긋나지 않았던 것.
 * 당시 조건은 지금 입력한 정보로 비교한다. 개업 전에 마감된 공고는 뺀다.
 * year를 주면 그 해에 마감된 것만 센다.
 */
export function missed(benefits: Benefit[], profile: Profile, year?: number): Estimate {
  const opened = (profile.businesses[0] as { openedYear?: number } | undefined)?.openedYear;
  const items: EstimateItem[] = [];
  for (const b of benefits) {
    if (!isClosed(b)) continue;
    const end = endTime(b.endsAt);
    const endYear = end !== null ? new Date(end + 9 * 3600000).getUTCFullYear() : null;
    if (year && endYear !== year) continue;
    if (opened && endYear !== null && opened > endYear) continue;
    const open = { ...b, status: '접수 중', budgetStatus: '해당 없음', startsAt: '', endsAt: '' } as Benefit;
    const r = match(open, profile, end !== null ? new Date(end) : undefined);
    if (r.includes('조건 일치')) items.push({ benefit: b, result: '조건 일치' });
    else if (r.includes('추가 확인 필요')) items.push({ benefit: b, result: '추가 확인 필요' });
  }
  return summarize(items);
}

/** 가입 전에도 정리본을 볼 수 있는 공고(받을 수 있는 지원금 위에서 3건, 놓친 지원금 위에서 3건) */
export function freeIds(benefits: Benefit[], profile: Profile | null): Set<string> {
  if (!profile) return new Set();
  return new Set([...estimate(benefits, profile).items.slice(0, FREE_COUNT), ...missed(benefits, profile).items.slice(0, FREE_COUNT)].map((x) => x.benefit.id));
}

/** 1,270만원 / 3억 2,000만원 처럼 읽기 쉬운 금액 */
export function won(n: number): string {
  if (n >= 100000000) { const eok = Math.floor(n / 100000000), man = Math.floor((n % 100000000) / 10000); return man ? `${eok}억 ${man.toLocaleString('ko-KR')}만원` : `${eok}억원`; }
  if (n >= 10000) return `${Math.floor(n / 10000).toLocaleString('ko-KR')}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 로그인 전(또는 서버 저장 전)에 이 기기에 임시 저장한 입력정보 */
export function useDraftProfile(uid: string | null, refreshKey: unknown): Profile | null {
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { let on = true; loadDraft(uid).then((d) => { if (on) setP(d?.consent ? d.profile : null); }); return () => { on = false; }; }, [uid, refreshKey]);
  return p;
}

/** 조건을 고른 사업장이 있는지 */
export const hasConditions = (p?: Profile | null) => !!p && p.businesses.length > 0 && !!(p.businesses[0].industry || p.businesses[0].province);
