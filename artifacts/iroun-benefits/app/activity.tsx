import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { getMyActivity, type ActivityItem } from '@workspace/api-client-react';
import { Badge, Btn, Card, Chip, Empty, ErrorState, Loading, Notice, Page, Section, T } from '@/components/ui';
import { AuthGate, NotGovernment } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { ACTIVITY_KEY, kst } from '@/lib/service';
import { apiErrorMessage } from '@/lib/text';

// 계약서 제6조 ⑥: 회사는 안내, 알림 발송·열람, 고객이 누른 버튼을 날짜·시간과 함께 기록하고, 고객이 요청하면 보여준다.
const ICON: Record<string, keyof typeof Feather.glyphMap> = {
  '맞춤 사업 안내': 'star', '앱 알림 보냄': 'bell', '알림 열어 봄': 'eye', '공고 열어 봄': 'file-text',
  '신청할게요': 'check-circle', '조건 불일치': 'x-circle', '내 정보 수정': 'edit-2',
};
const FILTERS = ['전체', '안내·알림', '내 선택', '열람'] as const;
type Filter = (typeof FILTERS)[number];
const inFilter = (k: string, f: Filter) =>
  f === '전체' || (f === '안내·알림' ? ['맞춤 사업 안내', '앱 알림 보냄'].includes(k) : f === '내 선택' ? ['신청할게요', '조건 불일치', '내 정보 수정'].includes(k) : ['알림 열어 봄', '공고 열어 봄'].includes(k));

function detail(x: ActivityItem): string {
  const d = x.data ?? {};
  const parts: string[] = [];
  if (d.alert) parts.push(String(d.alert));
  if (d.selection) parts.push(String(d.selection));
  if (typeof d.daysLeft === 'number') parts.push(d.daysLeft === 0 ? '당일 마감' : `마감까지 ${d.daysLeft}일`);
  if (x.kind === '맞춤 사업 안내' && d.under7Days) parts.push('마감 7일 안에 처음 안내');
  if (x.kind === '조건 불일치' && Array.isArray(d.exclusions) && d.exclusions.length) parts.push(`맞지 않는 조건: ${d.exclusions.join(', ')}`);
  return parts.join(' · ');
}

function Row({ x, last }: { x: ActivityItem; last: boolean }) {
  const c = useColors();
  const router = useRouter();
  const title = typeof x.data?.title === 'string' ? x.data.title : '';
  const choice = x.kind === '신청할게요' || x.kind === '조건 불일치';
  const sub = detail(x);
  return (
    <Pressable
      testID={`activity-${x.id}`}
      accessibilityRole={x.benefitId ? 'button' : undefined}
      disabled={!x.benefitId}
      onPress={() => x.benefitId && router.push({ pathname: '/benefit/[id]', params: { id: x.benefitId } })}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: choice ? c.primarySoft : c.secondary, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <Feather name={ICON[x.kind] ?? 'circle'} size={17} color={choice ? c.primary : c.mutedForeground} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <T v="label">{choice ? `[${x.kind}]` : x.kind}</T>
        </View>
        {title ? <T numberOfLines={2}>{title}</T> : null}
        {sub ? <T v="small" color={c.mutedForeground}>{sub}</T> : null}
        <T v="small" color={c.mutedForeground} testID={`activity-time-${x.id}`}>{kst(x.createdAt)}</T>
      </View>
    </Pressable>
  );
}

function Body() {
  const c = useColors();
  const router = useRouter();
  const acc = useAccount();
  const contract = !!acc.me?.entitlement.contractActive;
  const q = useQuery({ queryKey: ACTIVITY_KEY, queryFn: () => getMyActivity(), enabled: !!acc.me, staleTime: 5000 });
  const [filter, setFilter] = useState<Filter>('전체');
  const items = useMemo(() => (q.data?.items ?? []).filter((x) => inFilter(x.kind, filter)), [q.data, filter]);
  const counts = useMemo(() => {
    const all = q.data?.items ?? [];
    return { notice: all.filter((x) => x.kind === '맞춤 사업 안내').length, apply: all.filter((x) => x.kind === '신청할게요').length, mismatch: all.filter((x) => x.kind === '조건 불일치').length };
  }, [q.data]);

  if (q.isLoading) return <Loading rows={4} />;
  if (q.error) return <ErrorState message={apiErrorMessage(q.error, '기록을 불러오지 못했어요.')} onRetry={() => q.refetch()} />;
  const all = q.data?.items ?? [];
  return (
    <>
      <Notice tone="info" title="계약서 제6조에 따른 기록이에요">회사가 맞춤 사업을 안내하고 알림을 보낸 시각, 내가 알림·공고를 열어 본 시각, 내가 누른 버튼이 모두 남아요. 정산·환불 때 이 기록을 기준으로 봐요.</Notice>
      {!contract && all.length === 0 ? <Notice tone="warn">계약 고객이 되면 기록이 쌓여요.</Notice> : null}
      <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {([['안내받은 사업', counts.notice], ['신청할게요', counts.apply], ['조건 불일치', counts.mismatch]] as const).map(([l, n]) => (
          <View key={l} style={{ alignItems: 'center', gap: 2 }}>
            <T v="h2" color={c.primary}>{n}</T>
            <T v="small" color={c.mutedForeground}>{l}</T>
          </View>
        ))}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} testID={`activity-filter-${f}`} />)}
      </View>
      <Section title={`기록 ${items.length}건`}>
        {items.length === 0 ? (
          <Empty icon="list" title="아직 기록이 없어요" body="맞춤 사업이 안내되거나 버튼을 누르면 여기에 남아요." action={<Btn label="맞춤 공고 보기" onPress={() => router.push('/matches')} testID="activity-matches" />} />
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {items.slice(0, 500).map((x, i, arr) => <Row key={x.id} x={x} last={i === arr.length - 1} />)}
          </Card>
        )}
        {items.length > 500 ? <T v="small" color={c.mutedForeground}>최근 500건만 보여요. 전체 기록은 회사에 요청해 주세요.</T> : null}
      </Section>
      {all.length ? <Badge label={`가장 최근 기록 ${kst(all[0].createdAt)}`} tone="muted" /> : null}
    </>
  );
}

export default function Activity() {
  return (
    <Page back title="내 기록" subtitle="안내·알림·내 선택을 날짜·시간과 함께 보여드려요.">
      <NotGovernment />
      <AuthGate next="/activity"><Body /></AuthGate>
    </Page>
  );
}
