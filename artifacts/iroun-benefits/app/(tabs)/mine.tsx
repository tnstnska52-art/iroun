import React, { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  deleteTracking, getListBenefitsQueryKey, getListTrackingQueryKey, useListBenefits, useListTracking, readServiceInbox,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { Badge, Btn, Card, Chip, Disclaimer, Empty, ErrorState, ListRow, Loading, Notice, Page, Section, T, Wrap } from '@/components/ui';
import { STAGES, USER_RECORD_NOTICE, apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';
import { kst, useServiceStateView } from '@/lib/service';

type Tab = 'saved' | 'progress' | 'company';

export default function MyBenefits() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  // 내 기록은 이용권과 무관하게 로그인만 되어 있으면 불러온다(만료 후에도 보존).
  const tracking = useListTracking({ query: { queryKey: getListTrackingQueryKey(), enabled: acc.isSignedIn } });
  const benefits = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey(), enabled: acc.isSignedIn } });
  const svc = useServiceStateView();
  const [tab, setTab] = useState<Tab>('saved');
  const [stage, setStage] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusy(id); setMsg(null);
    try {
      await deleteTracking(id);
      await qc.invalidateQueries({ queryKey: getListTrackingQueryKey() });
    } catch (e) { setMsg(apiErrorMessage(e)); }
    setBusy(null);
  };
  const confirmRemove = (id: string, title: string) => {
    if (Platform.OS === 'web') { if (window.confirm(`"${title}" 기록을 지울까요?`)) remove(id); return; }
    Alert.alert('기록 지우기', `"${title}" 기록을 지울까요? 되돌릴 수 없습니다.`, [
      { text: '취소', style: 'cancel' }, { text: '지우기', style: 'destructive', onPress: () => remove(id) },
    ]);
  };

  if (!acc.isLoaded) return <Page tab title="내혜택"><Loading /></Page>;
  if (!acc.isSignedIn) {
    return (
      <Page tab title="내혜택" subtitle="저장한 공고, 신청 기록, 회사 요청을 한곳에서 봅니다.">
        <Empty icon="lock" title="로그인하면 볼 수 있어요" body="저장과 기록은 내 계정에만 보관됩니다." action={<>
          <Btn label="로그인 또는 가입" onPress={() => router.push('/auth')} testID="progress-login" />
          <Btn kind="secondary" label="전체혜택 둘러보기" onPress={() => router.push('/benefits')} />
        </>} />
      </Page>
    );
  }

  const titles = new Map((benefits.data ?? []).map((b) => [b.id, b.title]));
  const all = tracking.data ?? [];
  const saved = all.filter((t) => t.saved).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const progress = all.filter((t) => !stage || t.stage === stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const requests = svc.data?.requests ?? [];
  const unread = (svc.data?.inbox ?? []).filter((x) => !x.read_at).length;
  const list = tab === 'saved' ? saved : progress;

  return (
    <Page tab title="내혜택" subtitle="내가 저장하고 기록한 것만 보여드립니다.">
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.secondary, borderRadius: c.radius, padding: 4, gap: 4 }}>
        {([['saved', '저장', saved.length], ['progress', '신청 기록', all.length], ['company', '회사 요청', svc.data ? requests.length : null]] as const).map(([k, l, n]) => (
          <View key={k} style={{ flex: 1 }}>
            <Chip label={n === null ? l : `${l} ${n}`} selected={tab === k} onPress={() => setTab(k)} testID={`mine-tab-${k}`} />
          </View>
        ))}
      </View>
      <ListRow icon="bell" label={unread > 0 ? `알림함 · 새 알림 ${unread}건` : '알림함'} onPress={() => router.push('/inbox')} testID="mine-inbox" />
      {(svc.data?.companyUpdates ?? []).filter(n=>!n.read).map(n=><Card key={n.id}>
        <T v="h3">{n.title}</T><T>{n.state} · {kst(n.updatedAt)}</T>
        <Btn label="접수 안내 확인" onPress={async()=>{try{await readServiceInbox(n.id);await svc.refetch();router.push('/company-progress');}catch(e){setMsg(apiErrorMessage(e));}}} />
      </Card>)}
      {msg ? <Notice tone="error">{msg}</Notice> : null}

      {tab === 'company' ? (
        <Section title="회사에 보낸 요청">
          <Notice tone="info">회사 안의 진행 상태입니다. 정부·지자체 신청 결과가 아닙니다.</Notice>
          {svc.error ? <ErrorState message={apiErrorMessage(svc.error)} onRetry={() => svc.refetch()} /> : !svc.data ? <Loading rows={2} /> : requests.length === 0 ? (
            <Empty icon="clipboard" title="보낸 요청이 없어요" body="맞춤 공고에서 회사 도움을 요청할 수 있어요." action={<Btn kind="secondary" label="맞춤 공고 보기" onPress={() => router.push('/matches')} testID="progress-matches" />} />
          ) : requests.map((r) => {
            const open = r.customerTasks.filter((k) => !r.completedTasks.includes(k)).length;
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Badge label={r.state} tone={r.state === '회사 지원 종료' ? 'muted' : 'info'} />
                  <Badge label={r.kind} tone="muted" />
                  {open > 0 ? <Badge label={`할 일 ${open}건`} tone="warn" /> : null}
                </View>
                <T v="h3">{r.benefitTitle ?? r.snapshot?.title ?? '접수한 공고'}</T>
                <T v="small" color={c.mutedForeground}>접수번호 {r.id} · {kst(r.createdAt)}</T>
                {!acc.active ? <T v="small" color={c.warning}>새 맞춤 판정은 잠겼지만 접수 기록과 준비 안내는 계속 볼 수 있어요.</T> : null}
              </Card>
            );
          })}
          <Btn kind="secondary" label="회사 진행 자세히 보기" icon="clipboard" onPress={() => router.push('/company-progress')} testID="progress-company" />
        </Section>
      ) : (
        <>
          {tab === 'progress' ? (
            <>
              <Notice tone="warn" title="직접 기록한 내용입니다">{USER_RECORD_NOTICE}</Notice>
              <Wrap>
                <Chip label="전체" selected={!stage} onPress={() => setStage(undefined)} />
                {STAGES.map((s) => <Chip key={s} label={s} selected={stage === s} onPress={() => setStage(stage === s ? undefined : s)} />)}
              </Wrap>
            </>
          ) : null}
          {tracking.isLoading ? <Loading /> : tracking.error ? <ErrorState message={apiErrorMessage(tracking.error)} onRetry={() => tracking.refetch()} /> : list.length === 0 ? (
            <Empty icon="bookmark" title={tab === 'saved' ? '저장한 공고가 없어요' : all.length === 0 ? '신청 기록이 없어요' : '이 단계의 기록이 없어요'} body="공고 상세에서 저장하거나 단계를 기록하면 여기에 모입니다." action={<Btn label="전체혜택 보기" onPress={() => router.push('/benefits')} />} />
          ) : list.map((t) => {
            const title = titles.get(t.benefitId);
            return (
              <Card key={t.benefitId}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Badge label={t.stage} tone="info" />
                  {t.saved ? <Badge label="저장함" tone="ok" /> : null}
                  {t.deadlineReminder ? <Badge label="마감 알림 기록" tone="muted" /> : null}
                </View>
                <T v="h3">{title ?? '지금은 게시되지 않은 공고'}</T>
                <T v="small" color={c.mutedForeground}>서류 체크 {t.checkedDocuments.length}개 · 기록 {fmtDate(t.updatedAt)}</T>
                {title ? <Btn label="상세에서 이어서" icon="chevron-right" kind="secondary" onPress={() => router.push({ pathname: '/benefit/[id]', params: { id: t.benefitId } })} testID={`track-open-${t.benefitId}`} /> : null}
                <Btn label="기록 지우기" icon="trash-2" kind="ghost" loading={busy === t.benefitId} onPress={() => confirmRemove(t.benefitId, title ?? '이 공고')} testID={`track-remove-${t.benefitId}`} />
              </Card>
            );
          })}
        </>
      )}
      <Disclaimer />
    </Page>
  );
}
