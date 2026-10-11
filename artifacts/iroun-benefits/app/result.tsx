import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { Btn, CountUp, Disclaimer, Emoji, Loading, Page, SectionHead, T } from '@/components/ui';
import { GrantList, useJoinHref } from '@/components/GrantList';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { estimate, hasConditions, missed, useDraftProfile, won } from '@/lib/estimate';

/** 조건을 다 고른 뒤 보여주는 결과: 받을 수 있는 지원금 목록과 금액, 작년에 놓친 금액 */
export default function Result() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const join = useJoinHref();
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); }, []));
  const draft = useDraftProfile(acc.me?.id ?? null, focus);
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const profile = hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;
  const lastYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear() - 1;

  if (benefits.isLoading || (acc.isSignedIn && acc.loading)) return <Page back title="결과를 불러오고 있어요"><Loading /></Page>;
  if (!profile) {
    return (
      <Page back title="조건을 먼저 골라 주세요" subtitle="업종, 지역, 매출 같은 조건을 고르면 받을 수 있는 지원금을 찾아드려요.">
        <Btn label="내 사업자 지원금은 얼마일까?" onPress={() => router.replace('/onboarding')} testID="result-start" />
      </Page>
    );
  }
  const list = benefits.data ?? [];
  const est = estimate(list, profile);
  const past = missed(list, profile, lastYear);

  return (
    <Page back footer={!acc.active ? <>
      <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="result-signup" />
      <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 카드 등록 없음 · 자동결제 없음</T>
    </> : undefined}>
      <View testID="result-summary" style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20, gap: 4 }}>
        <T v="label" color={c.mutedForeground}>사장님 조건으로 찾은 지원금·환급금</T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <T v="hero">{est.items.length}건</T>
          {est.total > 0 ? <CountUp to={Math.floor(est.total / 10000)} color={c.primary} format={(n) => `최대 ${n.toLocaleString('ko-KR')}만원`} /> : null}
        </View>
        <T v="small" color={c.mutedForeground}>공고에 적힌 최대 금액을 더한 값이에요. 실제 지급액은 심사·예산에 따라 달라요.</T>
      </View>

      {past.items.length > 0 ? (
        <Pressable testID="result-missed" accessibilityRole="button" onPress={() => router.push({ pathname: '/benefits', params: { tab: 'missed' } })}
          style={({ pressed }) => ({ backgroundColor: c.destructiveSoft, borderRadius: c.radius + 4, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" color={c.destructive}>이 조건이면 {lastYear}년에</T>
            <T v="title" color={c.destructive}>{past.total > 0 ? `최대 ${won(past.total)}까지 신청할 수 있었어요` : `${past.items.length}건을 신청할 수 있었어요`}</T>
            <T v="small" color={c.destructive}>작년엔 모르고 지나갔어요. 올해는 놓치지 마세요.</T>
          </View>
          <Feather name="chevron-right" size={22} color={c.destructive} />
        </Pressable>
      ) : null}

      <SectionHead emoji="👉" motion="wiggle" title="지금 받을 수 있는 지원금" />
      {est.items.length === 0 ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20, gap: 8 }}>
          <T v="h3">지금 조건에 맞는 공고가 없어요</T>
          <T v="small" color={c.mutedForeground}>새 공고가 올라오면 알려드릴게요. 조건을 바꿔 다시 찾아볼 수도 있어요.</T>
          <Btn kind="secondary" label="조건 다시 고르기" onPress={() => router.replace('/onboarding')} />
        </View>
      ) : <GrantList items={est.items} unlocked={acc.active} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <Emoji char="💡" motion="pulse" size={16} />
        <T v="small" color={c.mutedForeground}>받을 가능성이 높고 금액이 큰 순서예요</T>
      </View>
      <Btn kind="ghost" label="조건 다시 고르기" onPress={() => router.replace('/onboarding')} testID="result-redo" />
      <Disclaimer />
    </Page>
  );
}
