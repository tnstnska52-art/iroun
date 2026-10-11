import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import {
  getGetRecommendationsQueryKey, getListBenefitsQueryKey, getListTrackingQueryKey,
  useGetRecommendations, useListBenefits, useListTracking,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { BenefitCard } from '@/components/BenefitCard';
import { Btn, Disclaimer, FooterLinks, Empty, ErrorState, ListRow, Loading, Page, Section, T } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import { daysLeft, endTime, fmtDate } from '@/lib/util';
import { useServiceStateView } from '@/lib/service';
import { useRecent } from '@/lib/recent';

interface NextAction { key: string; eyebrow: string; title: string; body: string; label: string; icon: keyof typeof Feather.glyphMap; go: Href; testID: string }

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
  const openTasks = acc.active ? reqs.reduce((n, x) => n + x.customerTasks.filter((k) => !x.completedTasks.includes(k)).length, 0) : 0;
  const unread = (svc.data?.inbox ?? []).filter((x) => !x.read_at).length;
  const savedCount = (tracking.data ?? []).filter((t) => t.saved).length;
  const list = benefits.data ?? [];
  const recent = recentIds.map((id) => list.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
  const profile = acc.me?.profile;
  const noProfile = !!profile && !profile.personal.birthYear && !profile.personal.province && profile.businesses.length === 0;
  const upcoming = list
    .filter((b) => { const d = daysLeft(b.endsAt); return d !== null && d >= 0; })
    .sort((a, b) => (endTime(a.endsAt) ?? 0) - (endTime(b.endsAt) ?? 0))
    .slice(0, 3);
  const recData = acc.active && !recs.error ? recs.data : undefined;
  const matched = new Set((recData ?? []).filter((r) => r.result === '조건 일치').map((r) => r.benefitId)).size;
  const needs = new Set((recData ?? []).filter((r) => r.result === '추가 확인 필요').map((r) => r.benefitId)).size;
  const ongoing = list.filter((b) => b.status === '접수 중').length;

  // 상태별로 단 하나의 다음 행동만 크게 보여준다.
  const next: NextAction | null = acc.loading && acc.isSignedIn ? null
    : !acc.isSignedIn ? { key: 'out', eyebrow: '로그인 없이 무료', title: ongoing > 0 ? `접수 중 공고 ${ongoing}건` : '전체 공고 둘러보기', body: '공식 출처를 확인한 공고만 보여드려요.', label: '전체혜택 둘러보기', icon: 'list', go: '/benefits', testID: 'home-browse' }
    : openTasks > 0 ? { key: 'task', eyebrow: '회사 요청', title: `내가 할 일 ${openTasks}건`, body: '회사가 요청한 자료를 확인해 주세요.', label: '할 일 보기', icon: 'clipboard', go: '/company-progress', testID: 'home-tasks' }
    : !acc.active ? { key: 'free', eyebrow: '무료 이용 중', title: ongoing > 0 ? `접수 중 공고 ${ongoing}건` : '전체 공고 둘러보기', body: savedCount > 0 ? `저장한 공고 ${savedCount}건이 내혜택에 있어요.` : '마음에 드는 공고를 저장해 두세요.', label: '전체혜택 보기', icon: 'list', go: '/benefits', testID: 'home-all-primary' }
    : noProfile ? { key: 'profile', eyebrow: '맞춤 확인 준비', title: '내 정보를 먼저\n알려 주세요', body: '한 번에 한 질문씩. 모르면 건너뛰어도 돼요.', label: '내 정보 입력 시작', icon: 'edit-3', go: '/onboarding', testID: 'home-start-onboarding' }
    : { key: 'match', eyebrow: '내 조건 확인 결과', title: recs.isLoading ? '결과 확인 중' : `조건 일치 ${matched}건`, body: recs.isLoading ? '잠시만 기다려 주세요.' : `추가 확인 필요 ${needs}건 · 참고용 결과입니다.`, label: '맞춤 공고 보기', icon: 'target', go: '/matches', testID: 'home-personalized' };

  return (
    <Page tab>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check-circle" size={24} color={c.primaryForeground} />
        </View>
        <T v="h3" style={{ flex: 1 }}>이로운혜택</T>
        <Pressable testID="nav-inbox" accessibilityRole="button" accessibilityLabel={unread > 0 ? `알림함, 새 알림 ${unread}건` : '알림함'}
          onPress={() => router.push(acc.isSignedIn ? '/inbox' : '/auth')}
          style={({ pressed }) => ({ minWidth: 52, height: 52, borderRadius: 26, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Feather name="bell" size={24} color={c.primary} />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 5, backgroundColor: c.destructive, alignItems: 'center', justifyContent: 'center' }}>
              <T v="small" color={c.destructiveForeground} style={{ fontWeight: '800', fontSize: 13, lineHeight: 18 }}>{unread > 99 ? '99+' : unread}</T>
            </View>
          ) : null}
        </Pressable>
      </View>

      {!next ? <Loading rows={1} /> : (
        <View testID={`home-next-${next.key}`} style={{ backgroundColor: c.primary, borderRadius: 24, padding: 22, gap: 12 }}>
          <T v="label" color="#C9D8F5">{next.eyebrow}</T>
          <T v="hero" color={c.primaryForeground}>{next.title}</T>
          <T color="#DCE6F8">{next.body}</T>
          <Btn kind="secondary" label={next.label} icon={next.icon} onPress={() => router.push(next.go)} testID={next.testID} style={{ borderColor: c.card }} />
          {acc.active && until ? <T v="small" color="#C9D8F5">{ent?.trialActive ? '체험' : '이용'} {fmtDate(until)}까지</T> : null}
        </View>
      )}
      {next?.key === 'out' ? <Btn kind="secondary" label="로그인·체험 시작" icon="log-in" onPress={() => router.push('/auth')} testID="home-login" /> : null}

      <Section title="바로 가기">
        <ListRow testID="home-ongoing" icon="clock" label="접수 중인 공고" desc={benefits.data ? `${ongoing}건` : undefined} onPress={() => router.push({ pathname: '/benefits', params: { status: '접수 중' } })} />
        <ListRow testID="home-deadline" icon="calendar" label="마감 가까운 순" desc="마감일이 있는 공고 먼저" onPress={() => router.push({ pathname: '/benefits', params: { sort: 'deadline' } })} />
        {acc.isSignedIn ? <ListRow testID="home-mine" icon="bookmark" label="내혜택" desc={tracking.data ? `저장 ${savedCount}건${svc.data ? ` · 회사 요청 ${reqs.length}건` : ''}` : undefined} onPress={() => router.push('/mine')} /> : null}
        {acc.isSignedIn && !acc.active ? <ListRow testID="home-membership" icon="info" label="맞춤 확인 안내" desc="이용권이 있을 때 쓰는 기능" onPress={() => router.push('/membership')} /> : null}
        {acc.isSignedIn ? <ListRow testID="home-access" icon="award" label="이용 상태·동의" onPress={() => router.push('/access')} /> : null}
      </Section>

      {recent.length > 0 ? (
        <Section title="최근 본 공고">
          {recent.slice(0, 3).map((x) => <ListRow key={x.id} icon="eye" label={x.title} onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: x.id } })} />)}
        </Section>
      ) : null}

      {upcoming.length > 0 ? (
        <Section title="마감이 가까운 공고">
          {upcoming.map((b) => <BenefitCard key={b.id} b={b} />)}
        </Section>
      ) : null}

      <Section title="새로 올라온 공고">
        {benefits.isLoading ? <Loading /> : benefits.error ? <ErrorState message={apiErrorMessage(benefits.error)} onRetry={() => benefits.refetch()} /> : list.length === 0 ? (
          <Empty icon="file-text" title="확인된 공고가 아직 없어요" body="공식 출처 확인이 끝난 공고만 올립니다." action={<Btn kind="secondary" label="새로고침" icon="refresh-cw" onPress={() => benefits.refetch()} />} />
        ) : (
          <>
            {list.slice(0, 3).map((b) => <BenefitCard key={b.id} b={b} />)}
            <Btn kind="secondary" label="전체혜택 보기" icon="list" onPress={() => router.push('/benefits')} testID="home-all" />
          </>
        )}
      </Section>

      <Section title="도움">
        <ListRow icon="target" label="맞춤 공고" onPress={() => router.push('/matches')} testID="nav-matches" />
        <ListRow icon="clipboard" label="회사 진행" onPress={() => router.push('/company-progress')} testID="nav-company-progress" />
        <ListRow icon="message-square" label="문의·건의" onPress={() => router.push('/inquiries')} testID="nav-inquiries" />
        {acc.me && acc.me.role !== 'user' && acc.me.role !== 'customer' ? <ListRow icon="briefcase" label="회사 업무" onPress={() => router.push('/office')} testID="nav-office" /> : null}
      </Section>
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
