import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { Btn, CountUp, Disclaimer, Emoji, ErrorState, Loading, Page, T } from '@/components/ui';
import { GrantList, GrantRow, Total } from '@/components/GrantList';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { useAccount } from '@/lib/session';
import { useServiceStateView } from '@/lib/service';
import { daysLeft } from '@/lib/util';
import { estimate, hasConditions, missed, useDraftProfile } from '@/lib/estimate';

type Tab = 'now' | 'missed';

/** 지원금 탭: 받을 수 있는 지원금과 놓친 지원금. 내 조건에 맞는 것만 추려서 보여준다. */
export default function Grants() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const svc = useServiceStateView();
  const p = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(p.tab === 'missed' ? 'missed' : 'now');
  useEffect(() => { if (p.tab === 'missed' || p.tab === 'now') setTab(p.tab); }, [p.tab]);
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); }, []));
  const draft = useDraftProfile(acc.me?.id ?? null, focus);
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const list = benefits.data ?? [];
  const expired = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const profile = expired ? null : hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;

  if (benefits.isLoading || (acc.isSignedIn && acc.loading)) return <Page tab title="지원금"><Loading /></Page>;
  if (benefits.error) return <Page tab title="지원금"><ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /></Page>;

  if (!profile) {
    const open = list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0).map((b) => ({ benefit: b, result: '추가 확인 필요' as const }));
    return (
      <Page tab title="지원금">
        <View testID="grants-empty" style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 22, gap: 10, alignItems: 'center' }}>
          <Emoji char={expired ? '🔒' : '🔍'} size={40} motion="bounce" />
          <T v="title" style={{ textAlign: 'center' }}>{expired ? '맞춤 이용이 끝났어요' : '조건만 고르면\n지원금을 찾아드려요'}</T>
          <T color={c.mutedForeground} style={{ textAlign: 'center' }}>{expired ? '접수 내역은 계속 볼 수 있어요' : '1분이면 끝나요'}</T>
          <Btn label={expired ? '상담에 문의 남기기' : '내 사업자 지원금은 얼마일까?'} onPress={() => router.push((expired ? '/consult' : '/onboarding') as never)} testID="grants-start" style={{ alignSelf: 'stretch' }} />
        </View>
        {expired && open.length > 0 ? (
          <>
            <T v="h2" style={{ marginTop: 8 }}>지금 신청할 수 있는 전체 공고</T>
            <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
              {open.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === open.length - 1} />)}
            </View>
          </>
        ) : null}
        <Disclaimer />
      </Page>
    );
  }

  const now = estimate(list, profile);
  const past = missed(list, profile);
  const cur = tab === 'now' ? now : past;
  const color = tab === 'now' ? c.primary : c.destructive;

  return (
    <Page tab title="지원금">
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: '#E5E8EB', borderRadius: 12, padding: 4 }}>
        {([['now', '받을 수 있는', now.items.length], ['missed', '놓친', past.items.length]] as const).map(([k, l, n]) => {
          const on = tab === k;
          return (
            <Pressable key={k} testID={`grants-tab-${k}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(k)}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: on ? c.card : 'transparent' }}>
              <T v="label" color={on ? c.foreground : c.mutedForeground} style={{ fontWeight: on ? '800' : '500' }}>{l} {n}</T>
            </Pressable>
          );
        })}
      </View>

      <Total testID={`grants-total-${tab}`} tone={tab === 'now' ? 'blue' : 'red'} label={tab === 'now' ? '신청 가능 지원금' : '놓친 지원금'} count={cur.items.length} total={cur.total} note={tab === 'missed' ? '올해는 놓치지 마세요' : undefined} />

      {cur.items.length === 0 ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20, gap: 6 }}>
          <T v="h3">{tab === 'now' ? '지금 조건에 맞는 공고가 없어요' : '놓친 지원금이 없어요'}</T>
          <T v="small" color={c.mutedForeground}>{tab === 'now' ? '새 공고가 뜨면 알려드릴게요' : '확인된 자료가 없어요'}</T>
        </View>
      ) : <GrantList items={cur.items} missed={tab === 'missed'} unlocked={acc.active} />}

      <Btn kind="ghost" label="조건 다시 고르기" onPress={() => router.push('/onboarding')} testID="grants-redo" />
      <Disclaimer />
    </Page>
  );
}
