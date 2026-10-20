import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { Btn, Disclaimer, Loading, Page, SectionHead, T } from '@/components/ui';
import { GrantList, Total, useJoinHref } from '@/components/GrantList';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { estimate, hasConditions, missed, useDraftProfile } from '@/lib/estimate';

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
      <Page back title="조건을 먼저 골라 주세요" >
        <Btn label="내 사업자 지원금은 얼마일까?" onPress={() => router.replace('/onboarding')} testID="result-start" />
      </Page>
    );
  }
  const list = benefits.data ?? [];
  const est = estimate(list, profile);
  const past = missed(list, profile, lastYear);
  const industry = (profile.businesses[0] as { industry?: string } | undefined)?.industry;
  const fitText = est.tailored && industry && industry !== '기타' ? `${industry} 업종 맞춤 ${est.tailored}건` : '';
  const smallText = est.small ? `소상공인 적합 ${est.small}건` : '';

  return (
    <Page back footer={!acc.active ? <>
      <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="result-signup" />
      <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 자동결제 없음</T>
    </> : undefined}>
      <Total testID="result-summary" label="신청 가능 지원금" count={est.items.length} total={est.total} note={est.total > 0 ? `공고 기준 최대 금액 합계${est.big ? ` · 10억 초과 대형사업 ${est.big}건 제외` : ''}` : undefined} />
      {past.items.length > 0 ? (
        <Total testID="result-missed" tone="red" label={`${lastYear}년에 놓친 지원금`} count={past.items.length} total={past.total} note="올해는 놓치지 마세요" onPress={() => router.push({ pathname: '/benefits', params: { tab: 'missed' } })} />
      ) : null}

      {fitText || smallText ? (
        <View testID="result-fit" style={{ backgroundColor: c.secondary, borderRadius: c.radius, paddingHorizontal: 16, paddingVertical: 12 }}>
          <T>{[fitText, smallText].filter(Boolean).join(' · ')}</T>
        </View>
      ) : null}
      <SectionHead emoji="👉" motion="wiggle" title={fitText ? `${industry} 맞춤부터 보여드려요` : '받을 수 있는 지원금'} />
      {est.items.length === 0 ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, padding: 20, gap: 8 }}>
          <T v="h3">지금 조건에 맞는 공고가 없어요</T>
          <T v="small" color={c.mutedForeground}>새 공고가 뜨면 알려드릴게요</T>
          <Btn kind="secondary" label="조건 다시 고르기" onPress={() => router.replace('/onboarding')} />
        </View>
      ) : <GrantList items={est.items} unlocked={acc.active} />}
      <Btn kind="ghost" label="조건 다시 고르기" onPress={() => router.replace('/onboarding')} testID="result-redo" />
      <Disclaimer />
    </Page>
  );
}
