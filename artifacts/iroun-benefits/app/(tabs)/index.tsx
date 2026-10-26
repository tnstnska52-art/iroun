import React, { useCallback, useState } from 'react';
import { Animated, Pressable, View, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useUnreadReplies } from '@/lib/replies';
import { TodayPicks } from '@/components/TodayPicks';
import { RotatingRows } from '@/components/RotatingRows';
import { closingOf, openToday, refundLike, todayPicks } from '@/lib/picks';
import { moneyType } from '@/lib/money';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { BigMoney, Btn, CountUp, Disclaimer, Emoji, ErrorState, FooterLinks, Loading, Page, SectionHead, T, useBeat } from '@/components/ui';
import { GrantRow, Total, useJoinHref } from '@/components/GrantList';
import { apiErrorMessage } from '@/lib/text';
import { daysLeft, fmtDate } from '@/lib/util';
import { remaining, useServiceStateView } from '@/lib/service';
import { industryGate } from '@/lib/fit';
import { FREE_COUNT, HEADLINE_STAT, IS_PREVIEW, STORE_SHOTS, customerMoney, customerOrder, estimate, hasConditions, missed, strictMode, useDraftProfile, won } from '@/lib/estimate';
import { difficulty } from '@/lib/difficulty';

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const beat = useBeat();
  const newReplies = useUnreadReplies().count;
  const join = useJoinHref();
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const refetchMe = acc.refetch;
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); if (acc.isSignedIn) refetchMe(); }, [acc.isSignedIn, refetchMe]));
  const draft = useDraftProfile(acc.me?.id ?? null, focus);
  const svc = useServiceStateView();

  const list = benefits.data ?? [];
  const ent = acc.me?.entitlement;
  const until = ent?.trialActive ? ent.trialUntil : ent?.contractActive ? ent.contractUntil : ent?.subscriptionActive ? ent.subscriptionUntil : ent?.grantActive ? ent.grantUntil : undefined;
  // 맞춤 이용이 끝난 고객에게는 맞춤 결과를 보여주지 않는다(전체 공고만).
  const expired = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const profile = expired ? null : hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;
  const est = profile ? estimate(list, profile, strictMode(ent?.contractActive, profile)) : null;
  const lastYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear() - 1;
  const past = profile ? missed(list, profile, lastYear) : null;
  const reqs = (svc.data?.requests ?? []).filter((x) => x.state !== '회사 지원 종료');
  const unread = (svc.data?.inbox ?? []).filter((x) => !x.read_at).length + (svc.data?.companyUpdates ?? []).filter((x) => !x.read).length;
  const alertCount = est ? est.items.length : list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0).length;
  const showStat = (IS_PREVIEW && !STORE_SHOTS) || HEADLINE_STAT.verified;
  // 오늘 실제로 접수 중인 공고만(시작 전·예산 소진·마감 제외). 저금리 융자·대출은 고객 목록에서 뺀다.
  const open = list.filter((b) => openToday(b) && customerMoney(b));
  const within30 = (b: { endsAt: string }) => { const d = daysLeft(b.endsAt); return d !== null && d >= 0 && d <= 30; };
  // 홈 목록의 바탕: 조건을 고른 뒤에는 내 조건에 맞는 것, 그 전에는 전체. 어느 쪽이든 오늘 접수 중인 것만, 받고 싶은 순서로.
  const pool = (est ? est.items : customerOrder(open.map((b) => ({ benefit: b, result: '추가 확인 필요' as const })))).filter((x) => openToday(x.benefit));
  // 30일 안에 마감: 마감이 가까운 순. 교육·컨설팅처럼 손에 돈이 들어오지 않는 사업은 뺀다.
  // 통장 입금·바우처 중 조건 일치·업종 맞춤·금액 있는 것부터 5건을 고른 뒤 마감 순으로 보여준다. 홈페이지와 같다.
  const myIndustry = (profile?.businesses[0] as { industry?: string } | undefined)?.industry;
  const closing = closingOf(pool.filter((x) => within30(x.benefit) && industryGate(x.benefit, myIndustry) === 'ok'));
  // 홈 목록: '놓치기 쉬운 지원금'(카드) · '놓치기 쉬운 환급금'(카드) · '지금 신청 가능한 지원금'(목록)은 서로 겹치지 않게 나눈다.
  const refunds = pool.filter((x) => refundLike(x.benefit)).slice(0, 5);
  const picks = todayPicks(pool.filter((x) => !refundLike(x.benefit)));
  const used = new Set([...refunds, ...picks].map((x) => x.benefit.id));
  const nowList = pool.filter((x) => !used.has(x.benefit.id)).slice(0, 10);
  const missBlock = refunds.length > 0 ? <TodayPicks items={refunds} title="놓치기 쉬운 환급금" emoji="🎁" testID="home-refund-picks" note="신청 가능" /> : null;
  // 지금 신청 가능한 지원금: 최대 10건을 3줄씩 보여주며 천천히 한 줄씩 위로 올린다.
  const nowBlock = nowList.length > 0 ? (
    <>
      <SectionHead emoji="👉" motion="wiggle" title="지금 신청 가능한 지원금" onMore={() => router.push('/benefits')} testID="home-list-more" />
      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
        <RotatingRows items={nowList} visible={3} interval={3500} testID="home-open-rows" />
      </View>
    </>
  ) : null;
  // 7일 안에 마감되는 것이 없어도 자리는 항상 보여준다(사라진 것처럼 보이지 않게).
  const closingBlock = (
    <>
      <SectionHead emoji="🚨" motion="pulse" title="30일 안에 마감되는 지원금" />
      <View testID="home-closing" style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
        {closing.length > 0
          ? closing.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === closing.length - 1} />)
          : <View style={{ minHeight: 64, justifyContent: 'center' }}><T color={c.mutedForeground}>30일 안에 마감되는 지원금이 없어요</T></View>}
      </View>
    </>
  );

  return (
    <Page tab header={<>
        <Image source={require('../../assets/images/logo-small.png')} accessibilityIgnoresInvertColors style={{ width: 32, height: 32, borderRadius: 9, marginRight: 8 }} />
        <T v="h2" style={{ flex: 1, fontWeight: '800' }}>이로운사람들</T>
      </>}>

      {benefits.isLoading ? <Loading rows={2} /> : benefits.error ? <ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /> : !est ? (
        <>
          {/* 조건을 고르기 전: 평균 숫자와 눈에 띄는 버튼 */}
          <View testID="home-headline" style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 22, gap: 6 }}>
            <T v="label" color={c.mutedForeground}>{showStat ? HEADLINE_STAT.label : expired ? '맞춤 이용이 끝났어요' : '받을 수 있는 지원금, 놓치고 있지 않나요?'}</T>
            {showStat ? <BigMoney manwon={HEADLINE_STAT.manwon} color={c.destructive} /> : null}
            {showStat && IS_PREVIEW && !HEADLINE_STAT.verified ? <T v="small" color={c.mutedForeground} style={{ fontSize: 11, lineHeight: 15 }}>미리보기 전용 · 근거 확인 전</T> : null}
            {expired ? <T v="small" color={c.mutedForeground}>접수 내역은 계속 볼 수 있어요</T> : null}
          </View>
          {!expired ? (
            <Animated.View style={{ borderRadius: c.radius + 6, transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }], shadowColor: c.primary, shadowOffset: { width: 0, height: 8 }, shadowRadius: 18, shadowOpacity: beat.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] }), elevation: 6 }}>
              <Pressable testID="home-estimate-start" accessibilityRole="button" accessibilityLabel="내 사업자 지원금은 얼마일까? 조건 고르기" onPress={() => router.push('/onboarding')}
                style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: c.radius + 6, paddingVertical: 24, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.9 : 1 })}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T v="title" color="#FFFFFF">내 사업자 지원금은{'\n'}얼마일까?</T>
                  <T v="small" color="#DCE6FF">1분이면 끝나요</T>
                </View>
                <Animated.View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: beat.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) }] }}>
                  <Feather name="arrow-right" size={26} color={c.primary} />
                </Animated.View>
              </Pressable>
            </Animated.View>
          ) : <Btn label="계속 이용하기" onPress={() => router.push('/membership' as never)} testID="home-continue" />}
          <TodayPicks items={picks} />
          {missBlock}
          {nowBlock}
          {closingBlock}
        </>
      ) : (
        <>
          {/* 조건을 고른 뒤: 받을 수 있는 금액과 놓친 금액 */}
          <Total testID="home-summary" label="신청 가능 지원금" count={est.sure} total={est.sureTotal} extra={est.maybe} onPress={() => router.push('/benefits')}>
            {acc.active && until && acc.me ? <T v="small" color={c.primary} style={{ fontWeight: '700', marginTop: 4 }}>{ent?.trialActive ? '무료체험' : '이용'} {remaining(until, acc.me.serverNow ?? new Date().toISOString())}</T> : null}
          </Total>
          {past && past.items.length > 0 ? (
            <Total testID="home-missed" tone="red" label={`${lastYear}년에 놓친 지원금`} count={past.sure} total={past.sureTotal} extra={past.maybe} note="올해는 놓치지 마세요" onPress={() => router.push({ pathname: '/benefits', params: { tab: 'missed' } })} />
          ) : null}

          {newReplies > 0 ? (
            <Pressable testID="home-reply" accessibilityRole="button" accessibilityLabel={`상담 답변 ${newReplies}개 도착. 눌러서 보기`} onPress={() => router.push('/consult' as never)}
              style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.9 : 1 })}>
              <Emoji char="💬" motion="wiggle" />
              <T v="h3" style={{ flex: 1 }}>답변이 도착했어요</T>
              <Feather name="chevron-right" size={22} color={c.mutedForeground} />
            </Pressable>
          ) : null}

          {acc.active && acc.me && !acc.me.preferences.notifications ? (
            <Pressable testID="home-alert-off" accessibilityRole="button" onPress={() => router.push('/alerts' as never)} style={{ backgroundColor: c.warningSoft, borderRadius: c.radius, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="bell-off" size={18} color={c.warning} />
              <T v="small" color={c.warning} style={{ flex: 1, fontWeight: '700' }}>알림이 꺼져 있어요</T>
              <T v="small" color={c.warning} style={{ fontWeight: '800' }}>켜기</T>
            </Pressable>
          ) : null}

          <TodayPicks items={picks} />
          {missBlock}
          {nowBlock}
          {est.items.length > 0 ? (
            <Pressable testID="home-list-all" accessibilityRole="button" onPress={() => router.push(acc.active ? '/benefits' : join)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <T v="label" color={c.primary}>{acc.active ? `전체 ${est.items.length}건 보기` : `무료로 전체 ${est.items.length}건 보기`}</T>
            </Pressable>
          ) : null}
          {!acc.active ? (
            <>
              <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="home-join" />
              <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 자동결제 없음</T>
            </>
          ) : null}

          {closingBlock}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Emoji char="✏️" size={15} motion="wiggle" />
            <Pressable testID="home-redo" accessibilityRole="button" onPress={() => router.push('/onboarding')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T v="small" color={c.mutedForeground} style={{ textDecorationLine: 'underline' }}>조건 다시 고르기</T>
            </Pressable>
          </View>
        </>
      )}

      {acc.me && acc.me.role !== 'user' && acc.me.role !== 'customer' ? <Btn kind="secondary" label="회사 업무 열기" icon="briefcase" onPress={() => router.push('/office')} testID="nav-office" /> : null}
      <Disclaimer />
    </Page>
  );
}
