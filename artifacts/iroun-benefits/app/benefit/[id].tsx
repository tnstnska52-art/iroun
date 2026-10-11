import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import { pushRecent } from '@/lib/recent';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  getGetBenefitQueryKey, getGetRecommendationsQueryKey, getListTrackingQueryKey, saveTracking,
  useGetBenefit, useGetRecommendations, useListTracking, type TrackingInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { Badge, Btn, Card, Chip, Disclaimer, ErrorState, Loading, Notice, Page, Section, T, Toggle, Wrap } from '@/components/ui';
import { STAGES, USER_RECORD_NOTICE, apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';
import { Collapsible, statusTone } from '@/components/BenefitCard';

export default function BenefitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const q = useGetBenefit(id ?? '', { query: { queryKey: getGetBenefitQueryKey(id ?? ''), enabled: !!id } });
  const recs = useGetRecommendations({ query: { queryKey: getGetRecommendationsQueryKey(), enabled: acc.active } });
  const tracks = useListTracking({ query: { queryKey: getListTrackingQueryKey(), enabled: acc.isSignedIn } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);

  const b = q.data;
  const cur = tracks.data?.find((t) => t.benefitId === id);
  const base: TrackingInput = cur
    ? { saved: cur.saved, stage: cur.stage, checkedDocuments: cur.checkedDocuments, deadlineReminder: cur.deadlineReminder }
    : { saved: false, stage: '관심', checkedDocuments: [], deadlineReminder: false };

  const recentId = b && !b.isTest && b.reviewStatus === '공개' ? b.id : undefined;
  useEffect(() => { if (recentId) void pushRecent(recentId); }, [recentId]);
  const shareSource = async () => {
    if (!b) return;
    const text = `${b.title}\n공식 출처: ${b.sourceUrl}`;
    try {
      if (Platform.OS === 'web') {
        const nav = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
        if (nav?.clipboard) { await nav.clipboard.writeText(text); setMsg({ t: 'ok', s: '공식 주소를 복사했습니다.' }); return; }
      }
      await Share.share({ message: text });
    } catch { setMsg({ t: 'error', s: '공유하지 못했습니다. 아래 주소를 길게 눌러 복사해 주세요.' }); }
  };

  const save = async (patch: Partial<TrackingInput>, ok: string) => {
    if (!id) return;
    setBusy(true); setMsg(null);
    try {
      await saveTracking(id, { ...base, ...patch });
      await qc.invalidateQueries({ queryKey: getListTrackingQueryKey() });
      setMsg({ t: 'ok', s: ok });
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e, '저장하지 못했습니다. 다시 시도해 주세요.') }); }
    setBusy(false);
  };

  if (q.isLoading) return <Page back><Loading rows={4} /></Page>;
  if (q.error || !b) {
    return <Page back title="지원 상세"><ErrorState message={apiErrorMessage(q.error, '지원 정보를 찾을 수 없습니다.')} onRetry={() => q.refetch()} /></Page>;
  }
  const myRecs = (acc.active && !recs.error ? recs.data ?? [] : []).filter((r) => r.benefitId === b.id);
  const bizName = (bid: string) => acc.me?.profile.businesses.find((x) => x.id === bid)?.name || '내 사업장';
  const tone = (r: string) => (r === '조건 일치' ? 'ok' : r === '추가 확인 필요' ? 'warn' : 'muted');

  return (
    <Page back>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Badge label={b.kind} tone={b.kind === '환급금' ? 'ok' : 'info'} />
          <Badge label={b.audience} tone="muted" />
          <Badge label={b.status} tone={statusTone(b.status)} />
          {b.isTest ? <Badge label="시험용 정보" tone="warn" /> : null}
        </View>
        <T v="title">{b.title}</T>
        <T color={c.mutedForeground}>{b.agency} · {b.region} · {b.category}</T>
        {b.summary ? <Collapsible text={b.summary} testID="summary-more" /> : null}
      </View>







      <Notice tone="info" title="신청과 선정은 기관이 합니다">{b.agency}의 공고입니다. 이로운사람들은 정부기관이 아니며, 회사 도움은 신청 준비를 돕는 별도 서비스입니다.</Notice>
      <Section title="지원 내용">
        <Card>
          <Badge label="지원형태 확인 필요" tone="muted" />
          <T>{b.support || '공식 출처에서 확인해 주세요.'}</T>
          <T v="small" color={c.mutedForeground}>공고 원문의 지원 내용입니다. 현금·현물 여부와 금액은 기관에 확인해 주세요.</T>
        </Card>
      </Section>
      <Section title="신청 기간">
        <Card>
          <T>시작: {fmtDate(b.startsAt)}</T>
          <T>마감: {fmtDate(b.endsAt)}</T>
          <T>상태: {b.status}</T>
          <T>예산 상태: {b.budgetStatus}</T>
        </Card>
      </Section>
      <Section title="공식 출처">
        <Card>
          <T>제공 기관: {b.agency}</T>
          <T v="small">출처 번호: {b.sourceId}</T>
          <T v="label" color={c.primary}>출처 확인일: {fmtDate(b.checkedAt)}</T>
          <Btn kind="secondary" label="공식 출처 열기" icon="external-link" onPress={() => Linking.openURL(b.sourceUrl)} testID="open-source" hint="브라우저에서 공식 페이지가 열립니다" />
          <Btn kind="ghost" label={Platform.OS === 'web' ? '공식 주소 복사' : '공식 주소 공유'} icon="share-2" onPress={shareSource} testID="share-source" hint="공고 제목과 공식 주소만 전달됩니다" />
          <T v="small" color={c.mutedForeground} selectable>{b.sourceUrl}</T>
        </Card>
      </Section>
      <Section title="확인할 사항">
        <Card>
          {b.checks.length === 0 ? <T>공식 출처에서 확인 중입니다.</T> : b.checks.map((x, i) => <T key={i}>• {x}</T>)}
          {b.rules.length > 0 ? <T v="label" style={{ marginTop: 6 }}>공개된 조건</T> : null}
          {b.rules.map((r, i) => <T key={`rule${i}`} v="small">• {r.label} ({r.scope === 'business' ? '사업장' : '개인·가구'})</T>)}
        </Card>
      </Section>
      <Section title="필요 서류">
        <Card>
          {b.documents.length === 0 ? <T>공식 출처에서 확인 중입니다.</T> : b.documents.map((d) => {
            const on = base.checkedDocuments.includes(d);
            return acc.isSignedIn ? (
              <Pressable key={d} testID={`doc-${d}`} accessibilityRole="checkbox" accessibilityLabel={d} accessibilityState={{ checked: on }} aria-checked={on} disabled={busy}
                onPress={() => save({ checkedDocuments: on ? base.checkedDocuments.filter((x) => x !== d) : [...base.checkedDocuments, d] }, '서류 체크를 기록했습니다.')}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name={on ? 'check-square' : 'square'} size={28} color={on ? c.primary : c.mutedForeground} />
                <T style={{ flex: 1 }}>{d}</T>
              </Pressable>
            ) : <T key={d}>• {d}</T>;
          })}
          {!acc.isSignedIn && b.documents.length > 0 ? <T v="small" color={c.mutedForeground}>로그인하면 준비한 서류를 체크해 저장할 수 있습니다.</T> : null}
        </Card>
      </Section>
      <Section title="산정 방식">
        <Card>
          {b.calculation ? <Collapsible text={b.calculation} testID="calc-more" /> : <T>공식 출처에서 확인해 주세요.</T>}
          <T v="small" color={c.mutedForeground}>실제 금액은 기관이 정합니다. 이 앱은 금액을 계산하지 않습니다.</T>
        </Card>
      </Section>
      <Section title="내 조건 비교 (회원)">
        {acc.active ? (
          recs.isLoading ? <Loading rows={1} /> : recs.error ? <ErrorState message={apiErrorMessage(recs.error)} onRetry={() => recs.refetch()} /> : myRecs.length === 0 ? (
            <Notice>이 지원에 대한 비교 결과가 아직 없습니다. 내 정보를 더 입력하면 비교할 수 있습니다.</Notice>
          ) : myRecs.map((r) => (
            <Card key={`${r.benefitId}-${r.businessId}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Badge label={r.result} tone={tone(r.result)} />
                <T v="label">{bizName(r.businessId)}</T>
              </View>
              {r.reasons.length > 0 ? <T v="label">맞는 이유</T> : null}
              {r.reasons.map((x, i) => <T key={`r${i}`}>• {x}</T>)}
              {r.unknowns.length > 0 ? <T v="label">더 알려주셔야 하는 정보</T> : null}
              {r.unknowns.map((x, i) => <T key={`u${i}`}>• {x}</T>)}
              {r.exclusions.length > 0 ? <T v="label">제외 사유</T> : null}
              {r.exclusions.map((x, i) => <T key={`e${i}`}>• {x}</T>)}
            </Card>
          ))
        ) : (
          <Card tone="soft">
            <T v="h3">회원 기능입니다</T>
            <T>회원 이용권이 있으면 내 사업장·가구 정보와 이 지원의 조건을 비교해 사유를 보여드립니다.</T>
            <Btn kind="secondary" label={acc.isSignedIn ? '이용권 안내 보기' : '로그인하고 안내 보기'} onPress={() => router.push(acc.isSignedIn ? '/membership' : '/auth')} testID="detail-membership" />
            <Btn kind="secondary" label="이용 상태·72시간 체험" onPress={() => router.push(acc.isSignedIn ? '/access' : '/auth')} testID="detail-access" />
          </Card>
        )}
      </Section>
      <Section title="내 기록">
        {!acc.isSignedIn ? (
          <Card tone="soft">
            <T>저장, 신청 단계, 마감 알림 기록은 로그인 후 사용할 수 있습니다.</T>
            <Btn label="로그인하고 기록하기" onPress={() => router.push('/auth')} testID="detail-login" />
          </Card>
        ) : (
          <Card>
            <Notice tone="warn" title="직접 기록한 내용입니다">{USER_RECORD_NOTICE}</Notice>
            <Btn testID="save-toggle" icon={base.saved ? 'bookmark' : 'plus'} kind={base.saved ? 'secondary' : 'primary'} label={base.saved ? '저장함 (눌러서 해제)' : '이 지원 저장하기'} loading={busy} onPress={() => save({ saved: !base.saved }, base.saved ? '저장을 해제했습니다.' : '저장했습니다.')} />
            <T v="label">내가 기록하는 신청 단계</T>
            <Wrap>{STAGES.map((s) => <Chip key={s} label={s} selected={base.stage === s && !!cur} onPress={() => save({ stage: s }, `단계를 "${s}"(으)로 기록했습니다.`)} testID={`stage-${s}`} />)}</Wrap>
            {acc.me && !acc.me.preferences.notifications && !base.deadlineReminder ? (
              <Notice tone="warn" title="알림 설정이 꺼져 있습니다">마감 알림을 기록하려면 먼저 내 정보에서 알림 받기를 켜 주세요. 푸시 알림은 아직 연동되지 않아 발송되지 않습니다.</Notice>
            ) : null}
            <Toggle testID="reminder-toggle" label="마감 알림 기록" desc="알림 의사를 기록합니다. 푸시 알림은 아직 연동되지 않아 발송되지 않습니다." value={base.deadlineReminder} onChange={(v) => save({ deadlineReminder: v }, v ? '마감 알림 의사를 기록했습니다.' : '마감 알림 기록을 해제했습니다.')} disabled={busy || (!base.deadlineReminder && !acc.me?.preferences.notifications)} />
            {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
          </Card>
        )}
      </Section>
      <Disclaimer />
    </Page>
  );
}
