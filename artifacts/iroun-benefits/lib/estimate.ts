import { useEffect, useState } from 'react';
import type { Benefit, Profile } from '@workspace/api-client-react';
import { matchBenefit, type Benefit as DomainBenefit, type Profile as DomainProfile } from '../../api-server/src/lib/benefit-domain';
import { loadDraft } from '@/lib/draft';
import { daysLeft } from '@/lib/util';

/** 첫 화면 안내 수치. 근거 자료가 확인되기 전에는 실제 앱에 노출하지 않는다(미리보기에서만 '예시'로 표시). */
export const HEADLINE_STAT = { text: '놓치고 있는 지원금 평균 1,270만원', verified: false };
export const IS_PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

export interface EstimateItem { benefit: Benefit; result: '조건 일치' | '추가 확인 필요' }
export interface Estimate { items: EstimateItem[]; total: number; counted: number; noAmount: number }

/**
 * 예상 지원금(최대). 내 입력정보로 '대상 제외'가 아닌 진행 중 공고의,
 * 공고 원문에 적힌 최대 금액만 더한다. 원문에 금액이 없는 공고는 합계에 넣지 않는다.
 * 실제 지급액·선정 여부를 뜻하지 않는다.
 */
export function estimate(benefits: Benefit[], profile: Profile): Estimate {
  const items: EstimateItem[] = [];
  for (const b of benefits) {
    if (b.status === '마감' || (daysLeft(b.endsAt) ?? 0) < 0) continue;
    const results = matchBenefit(b as unknown as DomainBenefit, profile as unknown as DomainProfile).map((m) => m.result);
    if (results.includes('조건 일치')) items.push({ benefit: b, result: '조건 일치' });
    else if (results.includes('추가 확인 필요')) items.push({ benefit: b, result: '추가 확인 필요' });
  }
  items.sort((x, y) => (x.result === y.result ? (y.benefit.maxAmount ?? 0) - (x.benefit.maxAmount ?? 0) : x.result === '조건 일치' ? -1 : 1));
  const withAmount = items.filter((x) => (x.benefit.maxAmount ?? 0) > 0);
  return { items, total: withAmount.reduce((n, x) => n + (x.benefit.maxAmount ?? 0), 0), counted: withAmount.length, noAmount: items.length - withAmount.length };
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
