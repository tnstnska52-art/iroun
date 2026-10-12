import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { useAccount } from '@/lib/session';
import { useServiceStateView } from '@/lib/service';
import { daysLeft } from '@/lib/util';
import { estimate, hasConditions, useDraftProfile } from '@/lib/estimate';

/** 지금 신청할 수 있는 지원금·환급금. 종 아이콘의 숫자와 알림 화면의 목록이 같은 계산을 쓴다. */
export function useOpenGrants() {
  const acc = useAccount();
  const svc = useServiceStateView();
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); }, []));
  const draft = useDraftProfile(acc.me?.id ?? null, focus);
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const list = benefits.data ?? [];
  const expired = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const profile = expired ? null : hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;
  const items = profile
    ? estimate(list, profile).items
    : list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0).map((b) => ({ benefit: b, result: '추가 확인 필요' as const }));
  return { acc, benefits, items, matched: !!profile };
}
