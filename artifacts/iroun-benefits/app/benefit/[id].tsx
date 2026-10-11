import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import { pushRecent } from '@/lib/recent';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  createServiceRequest, getGetBenefitQueryKey, getGetRecommendationsQueryKey, getGetServiceStateQueryKey, getListTrackingQueryKey, saveTracking,
  useGetBenefit, useGetRecommendations, useListTracking, type TrackingInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { useServiceStateView } from '@/lib/service';
import { Badge, Box, Btn, Chip, Disclaimer, ErrorState, Loading, Notice, Page, T, Toggle, Wrap } from '@/components/ui';
import { STAGES, USER_RECORD_NOTICE, apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';
import { won } from '@/lib/estimate';
import { confirmAsk } from '@/lib/confirm';
import { errStatus } from '@/lib/util';
import { Collapsible, dday } from '@/components/BenefitCard';

export default function BenefitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const svc = useServiceStateView();
  const q = useGetBenefit(id ?? '', { query: { queryKey: getGetBenefitQueryKey(id ?? ''), enabled: !!id } });
  const recs = useGetRecommendations({ query: { queryKey: getGetRecommendationsQueryKey(), enabled: acc.active } });
  const tracks = useListTracking({ query: { queryKey: getListTrackingQueryKey(), enabled: acc.isSignedIn } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ ok: boolean; title: string; body: string; reasons: string[]; canAsk?: boolean } | null>(null);

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

  const dd = dday(b);
  const expiredMember = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const closed = dd.label === '마감';
  const period = b.startsAt || b.endsAt ? `${b.startsAt ? fmtDate(b.startsAt) : '시작일 확인 필요'} ~ ${b.endsAt ? fmtDate(b.endsAt) : b.status === '상시 조회' ? '상시' : '마감일 공고 없음'}` : b.status === '상시 조회' ? '상시 조회' : '기간 확인 필요';
  const info: [keyof typeof Feather.glyphMap, string, string][] = [
    ['file-text', '지원형태', b.kind], ['users', '대상', b.audience === '사업' ? '사업자' : b.audience],
    ['home', '지원기관', b.agency], ['map-pin', '지역', b.region],
    ['activity', '접수상태', closed ? '마감' : b.status], ['dollar-sign', '지원금액', !acc.active ? '가입 후 확인' : b.maxAmount ? `최대 ${won(b.maxAmount)}` : '공고에서 확인'],
  ];
  const best = myRecs.find((r) => r.result === '조건 일치') ?? myRecs.find((r) => r.result === '추가 확인 필요');
  // 신청하기: 서버가 최신 조건으로 다시 판단한다. 되면 회사 접수함에 저장되고, 안 되면 이유를 보여준다.
  const apply = (kind: '신청 지원' | '자격 확인') => confirmAsk(kind === '신청 지원' ? '회사에 신청 도움을 요청할까요?' : '담당자에게 자격 확인을 요청할까요?', '회사 담당자가 확인하고 도와드려요. 정부기관 신청 완료는 아니에요.', '요청하기', async () => {
    if (applying) return;
    setApplying(true);
    const businessId = (myRecs.find((r) => r.result === '조건 일치') ?? myRecs.find((r) => r.result === '추가 확인 필요') ?? myRecs[0])?.businessId ?? '';
    try {
      const res = (await createServiceRequest({ benefitId: b.id, businessId, kind, confirmed: true })) as unknown as { id?: string; message?: string };
      await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
      setApplied({ ok: true, title: '회사에 요청이 접수됐어요', body: `${res.id ? `접수번호 ${res.id}. ` : ''}담당자를 배정하고 있어요. 정부기관 신청 완료는 아니에요.`, reasons: [] });
    } catch (e) {
      const detail = (e as { data?: { detail?: { result?: string; exclusions?: string[]; unknowns?: string[] } } }).data?.detail;
      if (errStatus(e) === 409 && detail?.result === '대상 제외') setApplied({ ok: false, title: '이 지원금은 신청할 수 없어요', body: '내 정보와 공고 조건이 달라요.', reasons: detail.exclusions ?? [] });
      else if (errStatus(e) === 409 && detail) setApplied({ ok: false, title: '조건을 더 확인해야 해요', body: '아래 내용이 확인되지 않아 바로 접수하지 못했어요. 담당자에게 확인을 요청할 수 있어요.', reasons: (detail.unknowns ?? []).slice(0, 5), canAsk: true });
      else setApplied({ ok: false, title: '요청하지 못했어요', body: errStatus(e) === 409 ? '마감됐거나 조건이 바뀌었어요. 화면을 다시 확인해 주세요.' : apiErrorMessage(e, '저장하지 못했어요. 다시 시도해 주세요.'), reasons: [] });
    }
    setApplying(false);
  });
  // 고객이 할 일을 순서대로. 공고 자료에 있는 내용만으로 만들고, 없는 내용은 공식 원문 확인으로 안내한다.
  const conditions = [...b.rules.map((r) => r.label), ...b.checks];
  const steps: { title: string; body: string }[] = closed ? [
    { title: '마감된 공고예요', body: '지금은 신청할 수 없어요. 다시 열리는지는 기관 공지에서 확인해 주세요.' },
    { title: '비슷한 공고 찾아보기', body: '전체혜택에서 지금 신청할 수 있는 공고를 확인해 보세요.' },
  ] : [
    { title: '내가 대상인지 확인하기', body: conditions.length ? `${conditions.slice(0, 3).join(', ')}${conditions.length > 3 ? ` 외 ${conditions.length - 3}가지` : ''}을(를) 확인해 주세요.${best ? ` 내 입력정보 기준: ${best.result}.` : ''}` : '세부 자격은 공식 신청 페이지에서 확인해 주세요.' },
    { title: '서류 준비하기', body: b.documents.length ? `${b.documents.join(', ')}. 아래 '필요 서류'에서 준비한 것을 체크해 두세요.` : '필요한 서류는 공식 신청 페이지에서 확인해 주세요.' },
    { title: b.endsAt ? `${fmtDate(b.endsAt)}까지 신청하기` : '공식 신청 페이지에서 신청하기', body: `아래 '공식 신청 페이지' 버튼을 눌러 ${b.agency}에 직접 신청해요.${b.budgetStatus === '확인 필요' ? ' 예산이 먼저 소진될 수 있으니 서두르는 편이 좋아요.' : ''}` },
    { title: '혼자 하기 어려우면 회사에 도움 요청', body: acc.active ? '담당자가 자격 확인과 서류 준비를 도와드려요. 회사 접수는 정부기관 신청 완료가 아니에요.' : '맞춤 이용 중이면 담당자가 자격 확인과 서류 준비를 도와드려요.' },
    { title: '결과 확인하고 기록하기', body: `선정·지급 결과는 ${b.agency}에서 알려줘요.${acc.isSignedIn ? " 아래 '내 기록'에 진행 단계를 남겨 두세요." : ''}` },
  ];

  return (
    <Page
      footer={<>
        {!closed ? <Btn kind="secondary" label={acc.active ? '회사에 신청 도움 요청' : acc.isSignedIn ? '3일 무료로 신청 방법 보기' : '회원가입하고 신청 방법 보기'} icon="send" loading={applying} onPress={() => (acc.active ? apply('신청 지원') : router.push((expiredMember ? '/inquiries' : acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never))} testID="detail-company-help" /> : null}
        <Btn label="공식 신청 페이지" icon="external-link" onPress={() => Linking.openURL(b.sourceUrl)} testID="open-source" hint="브라우저에서 공식 페이지가 열립니다" />
      </>}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginHorizontal: -6 }}>
        <Pressable testID="back-button" accessibilityRole="button" accessibilityLabel="이전 화면으로 돌아가기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={28} color={c.foreground} />
        </Pressable>
        <View style={{ flexDirection: 'row' }}>
          {acc.isSignedIn ? (
            <Pressable testID="save-toggle" accessibilityRole="button" accessibilityLabel={base.saved ? '저장함. 눌러서 해제' : '이 공고 저장하기'} accessibilityState={{ selected: base.saved }} disabled={busy}
              onPress={() => save({ saved: !base.saved }, base.saved ? '저장을 해제했어요.' : '저장했어요.')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="bookmark" size={22} color={base.saved ? c.primary : c.foreground} />
            </Pressable>
          ) : null}
          <Pressable testID="share-source" accessibilityRole="button" accessibilityLabel={Platform.OS === 'web' ? '공식 주소 복사' : '공식 주소 공유'} onPress={shareSource} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="share-2" size={22} color={c.foreground} />
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge label={b.category} tone="info" />
          {base.saved ? <Badge label="저장함" tone="ok" /> : null}
          {b.isTest ? <Badge label="시험용 정보" tone="warn" /> : null}
        </View>
        <T v="title">{b.title}</T>
        <T v="label" color={dd.urgent ? c.destructive : c.primary}>{dd.label}</T>
      </View>
      {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
      {applied ? (
        <View testID="apply-result" accessibilityLiveRegion="polite" style={{ backgroundColor: applied.ok ? c.successSoft : c.destructiveSoft, borderRadius: c.radius, padding: 16, gap: 6 }}>
          <T v="h3" color={applied.ok ? c.success : c.destructive}>{applied.title}</T>
          <T v="small">{applied.body}</T>
          {applied.reasons.map((x, i) => <T key={i} v="small">• {x}</T>)}
          {applied.ok ? <Btn kind="secondary" label="접수 내역 보기" onPress={() => router.push('/company-progress')} testID="apply-progress" /> : null}
          {!applied.ok && applied.canAsk ? <Btn kind="secondary" label="담당자에게 자격 확인 요청" loading={applying} onPress={() => apply('자격 확인')} testID="apply-ask" /> : null}
          {!applied.ok ? <Btn kind="ghost" label="정보 수정" onPress={() => router.push('/onboarding')} testID="apply-fix" /> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, marginTop: 4 }}>
        {info.map(([icon, label, value]) => (
          <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 }}>
            <Feather name={icon} size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <T v="small" color={c.mutedForeground} style={{ fontSize: 12, lineHeight: 16 }}>{label}</T>
              <T v="label" numberOfLines={2}>{value}</T>
            </View>
          </View>
        ))}
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="calendar" size={20} color={c.primary} />
          <View style={{ flex: 1 }}>
            <T v="small" color={c.mutedForeground} style={{ fontSize: 12, lineHeight: 16 }}>신청기간</T>
            <T v="label">{period}</T>
          </View>
        </View>
      </View>

      {acc.active ? (
        <>
      <Box title="이렇게 진행하세요">
        {steps.map((st, i) => (
          <View key={i} testID={`step-${i + 1}`} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <T v="small" color="#fff" style={{ fontWeight: '800' }}>{i + 1}</T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label">{st.title}</T>
              <T v="small" color={c.mutedForeground}>{st.body}</T>
            </View>
          </View>
        ))}
      </Box>

        </>
      ) : !closed ? (
        <Box title="이렇게 진행하세요">
          {steps.slice(0, 5).map((st, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, alignItems: 'center' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: i === 0 ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                <T v="small" color={i === 0 ? '#fff' : c.mutedForeground} style={{ fontWeight: '800' }}>{i + 1}</T>
              </View>
              {i === 0 ? <T v="label" style={{ flex: 1 }}>{st.title}</T> : <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: c.secondary, maxWidth: 120 + ((i * 37) % 90) }} />}
              {i > 0 ? <Feather name="lock" size={14} color={c.mutedForeground} /> : null}
            </View>
          ))}
          <View testID="detail-locked" style={{ backgroundColor: c.primarySoft, borderRadius: 10, padding: 14, gap: 8, marginTop: 4 }}>
            <T v="label" color={c.primary}>필요 서류 {b.documents.length > 0 ? `${b.documents.length}가지와 ` : ''}신청 순서는 {expiredMember ? '맞춤 이용 중에' : '회원가입하면'} 볼 수 있어요</T>
            <T v="small">무엇을 준비하고 어디에 어떻게 신청하는지 1번부터 순서대로 정리해 드려요.</T>
            <Btn label={expiredMember ? '계속 이용 문의하기' : acc.isSignedIn ? '3일 무료로 전체 보기' : '회원가입하고 전체 보기'} onPress={() => router.push((expiredMember ? '/inquiries' : acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never)} testID="detail-access" />
          </View>
        </Box>
      ) : null}

      {b.summary ? <Box title="개요"><Collapsible text={b.summary} testID="summary-more" /></Box> : null}
      <Box title="지원내용">
        <T>{b.support || '공식 출처에서 확인해 주세요.'}</T>
        <T v="small" color={c.mutedForeground}>현금·현물 여부와 금액은 기관이 정해요. 이 앱은 금액을 계산하지 않습니다.</T>
      </Box>

      {acc.active ? (
        <>
      <Box title="내 조건과 비교">
        {acc.active ? (
          recs.isLoading ? <Loading rows={1} /> : recs.error ? <ErrorState message={apiErrorMessage(recs.error)} onRetry={() => recs.refetch()} /> : myRecs.length === 0 ? (
            <T>아직 비교한 결과가 없어요. 내 정보를 더 입력하면 비교할 수 있어요.</T>
          ) : myRecs.map((r) => (
            <View key={`${r.benefitId}-${r.businessId}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Badge label={r.result} tone={tone(r.result)} />
                {r.businessId ? <T v="small" style={{ fontWeight: '700' }}>{bizName(r.businessId)}</T> : null}
              </View>
              {r.reasons.length > 0 ? <T v="label">내 조건과 맞는 점</T> : null}
              {r.reasons.map((x, i) => <T key={`r${i}`} v="small">• {x}</T>)}
              {r.unknowns.length > 0 ? <T v="label">이 조건을 더 확인해 주세요</T> : null}
              {r.unknowns.map((x, i) => <T key={`u${i}`} v="small">• {x}</T>)}
              {r.exclusions.length > 0 ? <T v="label">조건과 다른 점</T> : null}
              {r.exclusions.map((x, i) => <T key={`e${i}`} v="small" color={c.destructive}>• {x}</T>)}
            </View>
          ))
        ) : (
          <>
            <T>{acc.isSignedIn ? '맞춤 이용 중일 때 내 정보와 이 공고의 조건을 비교해 드려요.' : '로그인하면 내 정보와 이 공고의 조건을 비교해 드려요.'}</T>
            <Btn kind="secondary" label="3일 무료체험으로 확인하기" onPress={() => router.push((acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never)} testID="detail-access" />
          </>
        )}
        <T v="small" color={c.mutedForeground}>조건이 맞아도 선정·예산·중복수혜에 따라 지급이 달라질 수 있어요.</T>
      </Box>

      <Box title="필요 서류">
        {b.documents.length === 0 ? <T>공식 출처에서 확인해 주세요.</T> : b.documents.map((d) => {
          const on = base.checkedDocuments.includes(d);
          return acc.isSignedIn ? (
            <Pressable key={d} testID={`doc-${d}`} accessibilityRole="checkbox" accessibilityLabel={d} accessibilityState={{ checked: on }} aria-checked={on} disabled={busy}
              onPress={() => save({ checkedDocuments: on ? base.checkedDocuments.filter((x) => x !== d) : [...base.checkedDocuments, d] }, on ? '체크를 해제했어요.' : '준비한 서류로 저장했어요.')}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? c.primary : c.mutedForeground} />
              <T style={{ flex: 1 }}>{d}</T>
            </Pressable>
          ) : <T key={d}>• {d}</T>;
        })}
        {b.documents.length > 0 ? <T v="small" color={c.mutedForeground}>{acc.isSignedIn ? '준비한 서류를 눌러 체크해 두세요. 발급처는 공식 원문에서 확인해 주세요.' : '로그인하면 준비한 서류를 체크해 둘 수 있어요.'}</T> : null}
      </Box>

      <Box title="확인할 사항">
        {b.checks.length === 0 && b.rules.length === 0 ? <T>공식 출처에서 확인해 주세요.</T> : null}
        {b.checks.map((x, i) => <T key={i}>• {x}</T>)}
        {b.rules.map((r, i) => <T key={`rule${i}`}>• {r.label} ({r.scope === 'business' ? '사업장' : '개인·가구'})</T>)}
      </Box>

        </>
      ) : null}

      {b.calculation ? <Box title="금액 산정"><Collapsible text={b.calculation} testID="calc-more" /></Box> : null}

      {acc.isSignedIn ? (
        <Box title="내 기록">
          <T v="small" color={c.mutedForeground}>{USER_RECORD_NOTICE}</T>
          <Wrap>{STAGES.map((s) => <Chip key={s} label={s} selected={base.stage === s && !!cur} onPress={() => save({ stage: s }, `"${s}" 단계로 저장했어요.`)} testID={`stage-${s}`} />)}</Wrap>
          <Toggle testID="reminder-toggle" label="마감 알림 받기" desc={!base.deadlineReminder && !acc.me?.preferences.notifications ? '내정보에서 알림 받기를 먼저 켜 주세요.' : '실제 휴대폰 알림은 아직 연결 전이에요.'} value={base.deadlineReminder} onChange={(v) => save({ deadlineReminder: v }, v ? '마감 알림을 저장했어요.' : '마감 알림을 해제했어요.')} disabled={busy || (!base.deadlineReminder && !acc.me?.preferences.notifications)} />
        </Box>
      ) : null}

      <Box title="공식 출처">
        <T>{b.agency}의 공고예요. 신청과 선정은 기관이 합니다.</T>
        <T v="small" color={c.mutedForeground}>자료 확인 {fmtDate(b.checkedAt)} · 출처 번호 {b.sourceId}</T>
        <T v="small" color={c.mutedForeground} selectable>{b.sourceUrl}</T>
        <T v="small" color={c.mutedForeground}>이로운사람들은 정부기관이 아니며, 회사 도움은 신청 준비를 돕는 별도 서비스예요.</T>
      </Box>
      <Disclaimer />
    </Page>
  );
}
