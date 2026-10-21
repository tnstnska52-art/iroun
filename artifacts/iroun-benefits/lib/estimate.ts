import { useEffect, useState } from 'react';
import type { Benefit, Profile } from '@workspace/api-client-react';
import { matchBenefit, type Benefit as DomainBenefit, type Profile as DomainProfile } from '../../api-server/src/lib/benefit-domain';
import { loadDraft } from '@/lib/draft';
import { daysLeft, endTime } from '@/lib/util';
import { difficulty } from '@/lib/difficulty';
import { isLoan, moneyRank } from '@/lib/money';
import { industryGate } from '@/lib/fit';
export { industryGate };

/** 첫 화면 숫자: 사업자가 1년에 놓치는 지원금 평균(만원). 근거 자료 확인 전에는 실제 앱에 노출하지 않는다. */
export const HEADLINE_STAT = { label: '1년에 놓치는 지원금 평균', manwon: 1273, verified: false };
export const IS_PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
/** 가입 전에 정리본까지 열어 주는 공고 수 */
export const FREE_COUNT = 3;

export interface EstimateItem { benefit: Benefit; result: '조건 일치' | '추가 확인 필요'; /** 고른 업종에 맞춤인 공고 */ tailored?: boolean }
export interface Estimate { /** 조건 일치 건수와 금액 합계(10억 이하, 금액 있는 것) */ sure: number; sureTotal: number; /** 추가 확인 필요 건수와 금액 합계 */ maybe: number; maybeTotal: number; items: EstimateItem[]; total: number; counted: number; noAmount: number; /** 합계에서 뺀 10억 초과 대형사업 수 */ big: number; /** 업종 맞춤 건수 */ tailored: number; /** 소상공인 적합(4~5점) 건수 */ small: number; /** 정밀 모드에서 목록에서 뺀 '추가 확인 필요' 공고(담당자가 원문 확인) */ pending: EstimateItem[] }
/** 이 금액을 넘는 공고(대형 R&D·투자·인프라)는 동네 사업장이 받을 돈이 아니라 합계에서 빼고 뒤로 보낸다. 홈페이지와 같다. */
export const BIG = 100_000_000;
type Fit = { industries: string[]; small: number };
const fitOf = (b: Benefit) => (b as unknown as { fit?: Fit }).fit;
/** 업종 맞춤: AI 가 정한 관련 업종 또는 공고 자격 업종에 고른 업종이 들어 있다. 자격 판정이 아니라 정렬·표시용. */
export function isTailored(b: Benefit, industry?: string): boolean {
  if (!industry || industry === '기타') return false;
  if (fitOf(b)?.industries?.includes(industry)) return true;
  return (b.rules ?? []).some((r) => r.field === 'industry' && Array.isArray(r.value) && (r.value as unknown[]).includes(industry));
}
/** 동네 가게가 실제로 받을 가능성 1~5(모르면 3) */
export const smallFit = (b: Benefit) => fitOf(b)?.small ?? 3;
const tier = (b: Benefit) => { const a = b.maxAmount ?? 0; return a && a <= BIG ? 0 : !a ? 1 : 2; };

const isClosed = (b: Benefit) => b.status === '마감' || b.budgetStatus === '소진' || (daysLeft(b.endsAt) ?? 0) < 0;
/** 아직 접수가 시작되지 않은 공고(시작일이 미래). '지금 신청 가능'에 넣지 않는다. */
const notStarted = (b: Benefit) => !!b.startsAt && Number.isFinite(Date.parse(b.startsAt)) && Date.parse(b.startsAt) > Date.now();
const match = (b: Benefit, p: Profile, at?: Date) => matchBenefit(b as unknown as DomainBenefit, p as unknown as DomainProfile, at).map((m) => m.result);
const left = (b: Benefit) => daysLeft(b.endsAt) ?? 9999;
/**
 * 고객이 받고 싶은 순서. 금액보다 "통장에 돈이 들어오는지"를 먼저 본다.
 * 통장 입금(현금 지원·환급) → 바우처·감면 → 구입비 보조 → 교육·컨설팅
 * → 조건 일치 → 업종 맞춤 → 소상공인 적합 → 신청이 쉬운 것 → 금액 있는 것(10억 이하) → 금액이 큰 것 → 마감이 가까운 것
 */
export const order = (x: EstimateItem, y: EstimateItem) =>
  moneyRank(x.benefit) - moneyRank(y.benefit)
  || (x.result === y.result ? 0 : x.result === '조건 일치' ? -1 : 1)
  || Number(!!y.tailored) - Number(!!x.tailored)
  || smallFit(y.benefit) - smallFit(x.benefit)
  || difficulty(x.benefit) - difficulty(y.benefit)
  || tier(x.benefit) - tier(y.benefit)
  || (y.benefit.maxAmount ?? 0) - (x.benefit.maxAmount ?? 0)
  || left(x.benefit) - left(y.benefit);
const industryOf = (p: Profile) => (p.businesses[0] as { industry?: string } | undefined)?.industry;
function summarize(items: EstimateItem[], profile: Profile): Estimate {
  const ind = industryOf(profile);
  for (const x of items) x.tailored = isTailored(x.benefit, ind);
  items.sort(order);
  // 합계는 통장에 들어오는 돈(현금·환급·바우처)만, 1억 이하 공고만 더한다. 홈페이지와 같다.
  const withAmount = items.filter((x) => (x.benefit.maxAmount ?? 0) > 0 && (x.benefit.maxAmount ?? 0) <= BIG && moneyRank(x.benefit) <= 1);
  const sum = (xs: EstimateItem[]) => xs.reduce((n, x) => n + (x.benefit.maxAmount ?? 0), 0);
  // 화면 맨 위 건수·금액은 조건이 확실히 맞는 공고만 센다. 확인이 필요한 공고는 따로 알려 준다.
  const sureItems = items.filter((x) => x.result === '조건 일치');
  return {
    sure: sureItems.length, sureTotal: sum(sureItems.filter((x) => withAmount.includes(x))),
    maybe: items.length - sureItems.length, maybeTotal: sum(items.filter((x) => x.result !== '조건 일치' && withAmount.includes(x))),
    items, total: sum(withAmount), counted: withAmount.length,
    noAmount: items.filter((x) => !(x.benefit.maxAmount ?? 0)).length, big: items.filter((x) => (x.benefit.maxAmount ?? 0) > BIG).length,
    tailored: items.filter((x) => x.tailored).length, small: items.filter((x) => smallFit(x.benefit) >= 4).length, pending: [],
  };
}

/**
 * 받을 수 있는 지원금. 내 조건으로 '대상 제외'가 아닌 진행 중 공고를 모으고,
 * 공고 원문에 적힌 최대 금액만 더한다. 실제 지급액·선정 여부를 뜻하지 않는다.
 */
export function estimate(benefits: Benefit[], profile: Profile, strict = false): Estimate {
  const items: EstimateItem[] = [], pending: EstimateItem[] = [];
  for (const b of benefits) {
    // 마감·예산 소진·접수 전 공고와 저금리 융자·대출은 고객 목록에 넣지 않는다.
    if (isClosed(b) || notStarted(b) || isLoan(b)) continue;
    const gate = industryGate(b, industryOf(profile));
    if (gate === 'out') continue;
    const r = match(b, profile);
    if (r.includes('조건 일치') && gate === 'ok') items.push({ benefit: b, result: '조건 일치' });
    else if (r.includes('추가 확인 필요') || r.includes('조건 일치')) (strict ? pending : items).push({ benefit: b, result: '추가 확인 필요' });
  }
  const est = summarize(items, profile);
  // 정밀 모드(패키지 고객): 목록·금액은 조건이 확실히 맞는 공고만. 나머지는 담당자 확인용으로 따로 둔다.
  if (strict) est.pending = summarize(pending, profile).items;
  return est;
}

/** 조건을 고르기 전 전체 공고 목록: 융자를 빼고 고객이 받고 싶은 순서로 정렬한다. */
export function customerOrder<T extends EstimateItem>(items: T[]): T[] {
  return items.filter((x) => !isLoan(x.benefit)).sort(order);
}

/** 정밀 조건(대표자 출생연도·사업자 형태·여성 대표 여부)을 다 골랐는지 */
export function preciseDone(p?: Profile | null): boolean {
  const b = p?.businesses[0] as { entity?: string; womanOwned?: string } | undefined;
  return !!p?.personal?.birthYear && !!b?.entity && !!b?.womanOwned;
}
/** 지원금 패키지(회사 계약) 고객이고 정밀 조건까지 골랐으면 '조건 일치만' 보여준다. */
export function strictMode(contractActive: boolean | undefined, p?: Profile | null): boolean {
  return !!contractActive && preciseDone(p);
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
    if (!isClosed(b) || isLoan(b)) continue;
    const gate = industryGate(b, industryOf(profile));
    if (gate === 'out') continue;
    const end = endTime(b.endsAt);
    const endYear = end !== null ? new Date(end + 9 * 3600000).getUTCFullYear() : null;
    if (year && endYear !== year) continue;
    if (opened && endYear !== null && opened > endYear) continue;
    const open = { ...b, status: '접수 중', budgetStatus: '해당 없음', startsAt: '', endsAt: '' } as Benefit;
    const r = match(open, profile, end !== null ? new Date(end) : undefined);
    if (r.includes('조건 일치') && gate === 'ok') items.push({ benefit: b, result: '조건 일치' });
    else if (r.includes('추가 확인 필요') || r.includes('조건 일치')) items.push({ benefit: b, result: '추가 확인 필요' });
  }
  return summarize(items, profile);
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
