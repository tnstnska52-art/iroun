import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import {
  getGetRecommendationsQueryKey, getListBenefitsQueryKey, getListTrackingQueryKey,
  useGetRecommendations, useListBenefits, useListTracking, type Benefit,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { BenefitCard, dday } from '@/components/BenefitCard';
import { Btn, Disclaimer, FooterLinks, Empty, ErrorState, Loading, Page, T } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import { daysLeft, endTime, fmtDate } from '@/lib/util';
import { remaining, useServiceStateView } from '@/lib/service';
import { useRecent } from '@/lib/recent';
import { profileCompletion } from '@/lib/profile';

/** 입력한 만큼 차오르는 물결. 장식이며 금액·확률을 뜻하지 않는다. */
function Wave({ pct }: { pct: number }) {
  const c = useColors();
  const H = 132, W = 400;
  const level = H - 18 - (Math.max(0, Math.min(100, pct)) / 100) * (H - 40);
  const wave = (y: number, a: number) => `M0 ${y} C ${W * 0.25} ${y - a}, ${W * 0.45} ${y + a}, ${W * 0.7} ${y - a * 0.4} S ${W} ${y + a}, ${W} ${y - a * 0.6} L ${W} ${H} L 0 ${H} Z`;
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <Path d={wave(level - 8, 16)} fill={c.primarySoft} />
      <Path d={wave(level + 6, 12)} fill="#9DB7F5" opacity={0.75} />
      <Path d={wave(level + 20, 9)} fill="#6C92EE" opacity={0.85} />
    </Svg>
  );
}

function SectionHead({ title, onMore, testID }: { title: string; onMore?: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable testID={testID} accessibilityRole={onMore ? 'button' : 'header'} accessibilityLabel={onMore ? `${title} 더 보기` : title} disabled={!onMore} onPress={onMore}
      style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 }}>
      <T v="h2">{title}</T>
      {onMore ? <Feather name="chevron-right" size={22} color={c.foreground} /> : null}
    </Pressable>
  );
}

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const recs = useGetRecommendations({ query: { queryKey: getGetRecommendationsQueryKey(), enabled: acc.active } });
  const tracking = useListTracking({ query: { queryKey: getListTrackingQueryKey(), enabled: acc.isSignedIn } });

  const refetchRecs = recs.refetch;
  const refetchMe = acc.refetch;
  useFocusEffect(useCallback(() => {
    if (acc.isSignedIn) { refetchMe(); if (acc.active) refetchRecs(); }
  }, [acc.isSignedIn, acc.active, refetchMe, refetchRecs]));

  const svc = useServiceStateView();
  const recentIds = useRecent();
  const ent = acc.me?.entitlement;
  const until = ent?.trialActive ? ent.trialUntil : ent?.contractActive ? ent.contractUntil : ent?.subscriptionActive ? ent.subscriptionUntil : ent?.grantActive ? ent.grantUntil : undefined;
  const reqs = (svc.data?.requests ?? []).filter((x) => x.state !== '회사 지원 종료');
  // 접수한 건의 할 일은 이용권이 끝나도 계속 보여준다.
  const openTasks = reqs.reduce((n, x) => n + x.customerTasks.filter((k) => !x.completedTasks.includes(k)).length, 0);
  const unread = (svc.data?.inbox ?? []).filter((x) => !x.read_at).length + (svc.data?.companyUpdates ?? []).filter((x) => !x.read).length;
  const savedCount = (tracking.data ?? []).filter((t) => t.saved).length;
  const list = benefits.data ?? [];
  const byId = new Map(list.map((b) => [b.id, b]));
  const recent = recentIds.map((id) => byId.get(id)).filter((b): b is Benefit => !!b);
  const profile = acc.me?.profile;
  const done = profileCompletion(profile);
  const upcoming = list
    .filter((b) => { const d = daysLeft(b.endsAt); return d !== null && d >= 0; })
    .sort((a, b) => (endTime(a.endsAt) ?? 0) - (endTime(b.endsAt) ?? 0));
  const recData = acc.active && !recs.error ? recs.data : undefined;
  const matchedIds = [...new Set((recData ?? []).filter((r) => r.result === '조건 일치').map((r) => r.benefitId))];
  const needIds = [...new Set((recData ?? []).filter((r) => r.result === '추가 확인 필요').map((r) => r.benefitId))].filter((id) => !matchedIds.includes(id));
  const ongoing = list.filter((b) => b.status === '접수 중').length;
  const open = list.filter((b) => b.status !== '마감' && (daysLeft(b.endsAt) ?? 0) >= 0);

  // 위 요약 카드: 실제 건수만 보여준다. 금액 합계나 예상액은 만들지 않는다.
  const summary: { big: string; sub: string; go: Href; strip: string; stripGo: Href; testID: string } =
    !acc.isSignedIn ? { big: `신청 가능 ${open.length}건`, sub: '로그인 없이 볼 수 있는 공고', go: '/benefits', strip: '로그인하고 내게 맞는 공고 확인하기', stripGo: '/auth', testID: 'home-browse' }
    : !acc.active ? { big: `신청 가능 ${open.length}건`, sub: ent && svc.data?.trialUsed ? '맞춤 이용이 끝났어요. 접수한 내역은 계속 볼 수 있어요.' : '무료로 볼 수 있는 공고', go: '/benefits', strip: svc.data?.trialUsed ? '이용 상태 확인하기' : '3일 무료체험으로 맞춤 공고 확인하기', stripGo: '/access', testID: 'home-all-primary' }
    : { big: recs.isLoading ? '확인하는 중' : `조건 일치 ${matchedIds.length}건`, sub: recs.isLoading ? '잠시만 기다려 주세요' : `추가 확인 필요 ${needIds.length}건 · 내 입력정보 기준`, go: '/matches', strip: done.pct < 100 ? '정보를 더 채우고 맞춤 공고 늘리기' : '맞춤 공고 전체 보기', stripGo: done.pct < 100 ? '/onboarding' : '/matches', testID: 'home-personalized' };

  const picks = (acc.active ? [...matchedIds, ...needIds].map((id) => byId.get(id)).filter((b): b is Benefit => !!b && b.status !== '마감') : open).slice(0, 8);
  const featured = upcoming[0];
  const quick: { icon: keyof typeof Feather.glyphMap; label: string; go: Href; testID: string }[] = [
    { icon: 'target', label: '맞춤공고', go: '/matches', testID: 'nav-matches' },
    { icon: 'bookmark', label: '내혜택', go: '/mine', testID: 'home-mine' },
    { icon: 'clipboard', label: '회사진행', go: '/company-progress', testID: 'nav-company-progress' },
    { icon: 'message-square', label: '문의', go: '/inquiries', testID: 'nav-inquiries' },
  ];
  const needLogin = (go: Href): Href => (acc.isSignedIn ? go : '/auth');

  return (
    <Page tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={18} color={c.primaryForeground} />
        </View>
        <T v="h2" style={{ flex: 1, fontWeight: '800' }}>이로운혜택</T>
        <Pressable testID="nav-inbox" accessibilityRole="button" accessibilityLabel={unread > 0 ? `알림함, 새 알림 ${unread}건` : '알림함'}
          onPress={() => router.push(acc.isSignedIn ? '/inbox' : '/auth')}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Feather name="bell" size={22} color={c.foreground} />
          {unread > 0 ? <View style={{ position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: c.destructive, borderWidth: 1.5, borderColor: c.background }} /> : null}
        </Pressable>
      </View>

      {/* 요약 카드 */}
      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 2, overflow: 'hidden' }}>
        <Pressable testID={summary.testID} accessibilityRole="button" accessibilityLabel={`${summary.big}. ${summary.sub}. 보기`} onPress={() => router.push(summary.go)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h2" color={c.primary} style={{ fontWeight: '800', fontSize: 20 }}>{summary.big}</T>
            <T v="small" color={c.mutedForeground}>{summary.sub}</T>
          </View>
          <View style={{ backgroundColor: c.secondary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
            <T v="small" color={c.mutedForeground} style={{ fontWeight: '600', fontSize: 12, lineHeight: 16 }}>보기</T>
          </View>
        </Pressable>
        <Pressable testID="home-summary-strip" accessibilityRole="button" accessibilityLabel={summary.strip} onPress={() => router.push(summary.stripGo)}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: '#F7F8FA', opacity: pressed ? 0.8 : 1 })}>
          <T v="small" style={{ fontWeight: '600' }}>{summary.strip}</T>
          <Feather name="chevron-right" size={18} color={c.mutedForeground} />
        </Pressable>
      </View>
      {acc.active && until ? <T v="small" color={c.mutedForeground} style={{ paddingHorizontal: 4 }}>{ent?.trialActive ? '무료체험' : '이용 기간'} {fmtDate(until)}까지{acc.me ? ` · ${remaining(until, acc.me.serverNow ?? new Date().toISOString())}` : ''}</T> : null}

      {/* 회사가 요청한 할 일: 있을 때만 */}
      {openTasks > 0 ? (
        <Pressable testID="home-tasks" accessibilityRole="button" accessibilityLabel={`내가 할 일 ${openTasks}건. 준비할 서류 보기`} onPress={() => router.push('/company-progress')}
          style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 2, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">지금은 이 서류를 준비해 주세요</T>
            <T v="small" color={c.mutedForeground}>회사에 접수한 건 · 내가 할 일 {openTasks}건</T>
          </View>
          <View style={{ backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
            <T v="small" color="#fff" style={{ fontWeight: '700' }}>확인</T>
          </View>
        </Pressable>
      ) : null}

      {/* 정보 입력 완성도 */}
      {acc.isSignedIn && !acc.loading && done.pct < 100 ? (
        <View testID="home-profile-card" style={{ backgroundColor: c.card, borderRadius: c.radius + 2, overflow: 'hidden', minHeight: 232 }}>
          <Wave pct={done.pct} />
          <View style={{ padding: 16, gap: 4 }}>
            <T v="title" style={{ fontSize: 20 }}>내 정보 입력 {done.pct}%</T>
            <T v="small" color={c.mutedForeground}>{done.pct === 0 ? '맞는 혜택을 찾도록 정확히 알려주세요.' : `나머지 ${100 - done.pct}%를 채우면 더 정확히 찾아드려요.`}</T>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ padding: 16 }}>
            <Btn label={done.pct === 0 ? '내 정보 채우기' : '이어서 입력'} onPress={() => router.push('/onboarding')} testID="home-start-onboarding" />
          </View>
        </View>
      ) : null}
      {!acc.isSignedIn ? (
        <View style={{ backgroundColor: c.card, borderRadius: c.radius + 2, overflow: 'hidden', minHeight: 200 }}>
          <Wave pct={8} />
          <View style={{ padding: 16, gap: 4 }}>
            <T v="title" style={{ fontSize: 20 }}>내게 맞는 혜택 찾기</T>
            <T v="small" color={c.mutedForeground}>한 번에 한 질문씩. 모르면 나중에 입력해도 돼요.</T>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ padding: 16 }}>
            <Btn label="로그인하고 시작" onPress={() => router.push('/auth')} testID="home-login" />
          </View>
        </View>
      ) : null}

      {/* 마감이 가장 가까운 공고 한 건 */}
      {featured ? (
        <Pressable testID="home-deadline" accessibilityRole="button" accessibilityLabel={`마감이 가까운 공고. ${featured.title}. ${dday(featured).label}`}
          onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: featured.id } })}
          style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: c.radius + 2, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3" numberOfLines={1}>{featured.title}</T>
            <T v="small" color={c.mutedForeground} numberOfLines={1}>마감이 가장 가까운 공고 · {fmtDate(featured.endsAt)}까지</T>
          </View>
          <View style={{ backgroundColor: c.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <T v="small" color={c.primary} style={{ fontWeight: '800' }}>{dday(featured).label}</T>
          </View>
        </Pressable>
      ) : null}

      {/* 가로로 넘기는 추천 */}
      {picks.length > 0 ? (
        <>
          <SectionHead title={acc.active ? '내 조건으로 확인한 공고' : '지금 신청할 수 있는 공고'} onMore={() => router.push(acc.active ? '/matches' : '/benefits')} testID="home-picks-more" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
            {picks.map((b) => (
              <Pressable key={b.id} testID={`home-pick-${b.id}`} accessibilityRole="button" accessibilityLabel={`${b.title}. 자세히 보기`}
                onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: b.id } })}
                style={({ pressed }) => ({ width: 136, height: 128, borderRadius: 14, overflow: 'hidden', opacity: pressed ? 0.85 : 1 })}>
                <LinearGradient colors={['#4B6CB7', '#3A4E7A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
                  <T v="label" color="#fff" numberOfLines={3}>{b.title}</T>
                  <T v="small" color="#DCE6FF" style={{ fontWeight: '700' }}>{acc.active && matchedIds.includes(b.id) ? '조건 일치' : acc.active ? '추가 확인' : dday(b).label}</T>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* 바로가기 네 칸 */}
      <View style={{ backgroundColor: c.card, borderRadius: c.radius + 2, paddingVertical: 14, flexDirection: 'row' }}>
        {quick.map((q) => (
          <Pressable key={q.testID} testID={q.testID} accessibilityRole="button" accessibilityLabel={q.label} onPress={() => router.push(needLogin(q.go))}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, minHeight: 64, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={q.icon} size={20} color={c.primary} />
            </View>
            <T v="small" style={{ fontWeight: '600' }}>{q.label}</T>
          </Pressable>
        ))}
      </View>
      {acc.isSignedIn ? <T v="small" color={c.mutedForeground} style={{ paddingHorizontal: 4 }}>저장한 공고 {savedCount}건{svc.data ? ` · 회사에 접수한 건 ${reqs.length}건` : ''}</T> : null}

      {recent.length > 0 ? (
        <>
          <SectionHead title="최근 본 공고" />
          {recent.slice(0, 3).map((x) => <BenefitCard key={x.id} b={x} />)}
        </>
      ) : null}

      <SectionHead title="새로 올라온 공고" onMore={() => router.push('/benefits')} testID="home-all" />
      {benefits.isLoading ? <Loading /> : benefits.error ? <ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /> : list.length === 0 ? (
        <Empty icon="file-text" title="아직 확인한 자료가 없어요" body="공식 출처 확인이 끝난 공고만 올립니다." action={<Btn kind="secondary" label="다시 시도" icon="refresh-cw" onPress={() => benefits.refetch()} />} />
      ) : list.slice(0, 5).map((b) => <BenefitCard key={b.id} b={b} />)}
      <T v="small" color={c.mutedForeground} style={{ paddingHorizontal: 4 }}>접수 중 {ongoing}건 · 조건이 맞아도 선정·예산에 따라 지급이 달라질 수 있어요.</T>

      {acc.me && acc.me.role !== 'user' && acc.me.role !== 'customer' ? <Btn kind="secondary" label="회사 업무 열기" icon="briefcase" onPress={() => router.push('/office')} testID="nav-office" /> : null}
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
