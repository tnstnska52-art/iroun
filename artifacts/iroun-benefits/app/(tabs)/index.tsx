import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getListBenefitsQueryKey, useListBenefits } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { Btn, CountUp, Disclaimer, Emoji, ErrorState, FooterLinks, Loading, Page, SectionHead, T } from '@/components/ui';
import { GrantRow, useJoinHref } from '@/components/GrantList';
import { apiErrorMessage } from '@/lib/text';
import { daysLeft, fmtDate } from '@/lib/util';
import { remaining, useServiceStateView } from '@/lib/service';
import { FREE_COUNT, HEADLINE_STAT, IS_PREVIEW, estimate, hasConditions, missed, useDraftProfile, won } from '@/lib/estimate';
import { difficulty } from '@/lib/difficulty';

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
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
  const est = profile ? estimate(list, profile) : null;
  const lastYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear() - 1;
  const past = profile ? missed(list, profile, lastYear) : null;
  const reqs = (svc.data?.requests ?? []).filter((x) => x.state !== '회사 지원 종료');
  const openTasks = reqs.reduce((n, x) => n + x.customerTasks.filter((k) => !x.completedTasks.includes(k)).length, 0);
  const unread = (svc.data?.inbox ?? []).filter((x) => !x.read_at).length + (svc.data?.companyUpdates ?? []).filter((x) => !x.read).length;
  const showStat = IS_PREVIEW || HEADLINE_STAT.verified;
  const open = list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0);
  const easy = open.map((b) => ({ benefit: b, result: '추가 확인 필요' as const, level: difficulty(b) })).filter((x) => x.level <= 2).sort((x, y) => x.level - y.level).slice(0, 3);
  const closing = (est?.items ?? []).filter((x) => { const d = daysLeft(x.benefit.endsAt); return d !== null && d >= 0 && d <= 30; }).slice(0, 3);
  const shown = est ? (acc.active ? est.items.slice(0, 5) : est.items.slice(0, FREE_COUNT)) : [];

  return (
    <Page tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={19} color={c.primaryForeground} />
        </View>
        <T v="h2" style={{ flex: 1, fontWeight: '800' }}>이로운혜택</T>
        <Pressable testID="nav-inbox" accessibilityRole="button" accessibilityLabel={unread > 0 ? `알림함, 새 알림 ${unread}건` : '알림함'}
          onPress={() => router.push(acc.isSignedIn ? '/inbox' : '/auth')}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Feather name="bell" size={24} color={c.foreground} />
          {unread > 0 ? <View style={{ position: 'absolute', top: 8, right: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: c.destructive, borderWidth: 1.5, borderColor: c.background }} /> : null}
        </Pressable>
      </View>

      {benefits.isLoading ? <Loading rows={2} /> : benefits.error ? <ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /> : !est ? (
        <>
          {/* 조건을 고르기 전: 평균 숫자와 눈에 띄는 버튼 */}
          <View testID="home-headline" style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 22, gap: 6 }}>
            <T v="label" color={c.mutedForeground}>{showStat ? HEADLINE_STAT.label : expired ? '맞춤 이용이 끝났어요' : '받을 수 있는 지원금, 놓치고 있지 않나요?'}</T>
            {showStat ? <CountUp to={HEADLINE_STAT.manwon} color={c.destructive} style={{ fontSize: 44, lineHeight: 54 }} format={(n) => `${n.toLocaleString('ko-KR')}만원`} /> : null}
            {showStat && IS_PREVIEW && !HEADLINE_STAT.verified ? <T v="small" color={c.warning} style={{ fontSize: 12, lineHeight: 17 }}>미리보기 표시 · 수치 근거 확인 전에는 실제 앱에 나오지 않아요</T> : null}
            {expired ? <T v="small" color={c.mutedForeground}>접수한 내역은 계속 볼 수 있어요. 계속 이용하려면 상담에 문의를 남겨 주세요.</T> : null}
          </View>
          {!expired ? (
            <Pressable testID="home-estimate-start" accessibilityRole="button" accessibilityLabel="내 사업자 지원금은 얼마일까? 조건 고르기" onPress={() => router.push('/onboarding')}
              style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: c.radius + 6, paddingVertical: 24, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
              <View style={{ flex: 1, gap: 4 }}>
                <T v="title" color="#FFFFFF">내 사업자 지원금은{'\n'}얼마일까?</T>
                <T v="small" color="#DCE6FF">조건만 고르면 1분 만에 찾아드려요</T>
              </View>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="arrow-right" size={26} color={c.primary} />
              </View>
            </Pressable>
          ) : <Btn label="상담에 문의 남기기" onPress={() => router.push('/consult' as never)} testID="home-consult" />}
          {easy.length > 0 ? (
            <>
              <SectionHead emoji="🔥" motion="pulse" title="신청이 쉬운 지원금" onMore={() => router.push('/benefits')} testID="home-easy-more" />
              <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
                {easy.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === easy.length - 1} />)}
              </View>
            </>
          ) : null}
        </>
      ) : (
        <>
          {/* 조건을 고른 뒤: 받을 수 있는 금액과 놓친 금액 */}
          <Pressable testID="home-summary" accessibilityRole="button" onPress={() => router.push('/benefits')}
            style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 22, gap: 4, opacity: pressed ? 0.9 : 1 })}>
            <T v="label" color={c.mutedForeground}>{acc.me ? '사장님이 지금 받을 수 있는 지원금' : '사장님 조건으로 찾은 지원금'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
              {est.total > 0 ? <CountUp to={Math.floor(est.total / 10000)} color={c.primary} style={{ fontSize: 38, lineHeight: 48 }} format={(n) => `최대 ${n.toLocaleString('ko-KR')}만원`} /> : <T v="hero" color={c.primary}>{est.items.length}건</T>}
              <T v="h3" color={c.mutedForeground}>{est.items.length}건</T>
            </View>
            <T v="small" color={c.mutedForeground}>공고에 적힌 최대 금액 합계예요. 실제 지급액은 심사·예산에 따라 달라요.</T>
            {acc.active && until && acc.me ? <T v="small" color={c.primary} style={{ fontWeight: '700' }}>{ent?.trialActive ? '무료체험' : '이용 기간'} {fmtDate(until)}까지 · {remaining(until, acc.me.serverNow ?? new Date().toISOString())}</T> : null}
          </Pressable>

          {past && past.items.length > 0 ? (
            <Pressable testID="home-missed" accessibilityRole="button" onPress={() => router.push({ pathname: '/benefits', params: { tab: 'missed' } })}
              style={({ pressed }) => ({ backgroundColor: c.destructiveSoft, borderRadius: c.radius + 6, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" color={c.destructive}>이 조건이면 {lastYear}년에</T>
                <T v="h2" color={c.destructive}>{past.total > 0 ? `최대 ${won(past.total)}까지 신청할 수 있었어요` : `${past.items.length}건을 신청할 수 있었어요`}</T>
                <T v="small" color={c.destructive}>올해는 놓치지 마세요.</T>
              </View>
              <Feather name="chevron-right" size={22} color={c.destructive} />
            </Pressable>
          ) : null}

          {openTasks > 0 ? (
            <Pressable testID="home-tasks" accessibilityRole="button" accessibilityLabel={`내가 할 일 ${openTasks}건`} onPress={() => router.push('/company-progress')}
              style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: c.radius + 6, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.9 : 1 })}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" color="#DCE6FF">지금 할 일</T>
                <T v="h2" color="#FFFFFF">서류 {openTasks}가지를 준비해 주세요</T>
              </View>
              <Feather name="chevron-right" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {acc.active && acc.me && !acc.me.preferences.notifications ? (
            <Pressable testID="home-alert-off" accessibilityRole="button" onPress={() => router.push('/account')} style={{ backgroundColor: c.warningSoft, borderRadius: c.radius, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="bell-off" size={18} color={c.warning} />
              <T v="small" color={c.warning} style={{ flex: 1, fontWeight: '700' }}>알림이 꺼져 있어요. 새 지원금을 놓칠 수 있어요.</T>
              <T v="small" color={c.warning} style={{ fontWeight: '800' }}>켜기</T>
            </Pressable>
          ) : null}

          <SectionHead emoji="👉" motion="wiggle" title="받을 수 있는 지원금" onMore={() => router.push('/benefits')} testID="home-list-more" />
          <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
            {shown.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === shown.length - 1 && est.items.length <= shown.length} />)}
            {est.items.length > shown.length ? (
              <Pressable testID="home-list-all" accessibilityRole="button" onPress={() => router.push(acc.active ? '/benefits' : join)} style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
                <T v="label" color={c.primary}>{acc.active ? `전체 ${est.items.length}건 보기` : `나머지 ${est.items.length - shown.length}건 무료로 보기`}</T>
              </Pressable>
            ) : null}
          </View>
          {!acc.active ? (
            <>
              <Btn label="무료로 전체 보기" onPress={() => router.push(join)} testID="home-join" />
              <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>3일 무료 · 카드 등록 없음 · 자동결제 없음</T>
            </>
          ) : null}

          {acc.active && closing.length > 0 ? (
            <>
              <SectionHead emoji="🚨" motion="pulse" title="곧 마감되는 지원금" />
              <View style={{ backgroundColor: c.card, borderRadius: c.radius + 4, paddingHorizontal: 16 }}>
                {closing.map((x, i) => <GrantRow key={x.benefit.id} item={x} last={i === closing.length - 1} />)}
              </View>
            </>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Emoji char="✏️" size={15} motion="wiggle" />
            <Pressable testID="home-redo" accessibilityRole="button" onPress={() => router.push('/onboarding')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <T v="small" color={c.mutedForeground} style={{ textDecorationLine: 'underline' }}>조건 다시 고르기</T>
            </Pressable>
          </View>
        </>
      )}

      {acc.me && acc.me.role !== 'user' && acc.me.role !== 'customer' ? <Btn kind="secondary" label="회사 업무 열기" icon="briefcase" onPress={() => router.push('/office')} testID="nav-office" /> : null}
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
