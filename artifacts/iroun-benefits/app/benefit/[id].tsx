import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useUser } from '@clerk/expo';
import { pushRecent } from '@/lib/recent';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  createServiceRequest, getGetMeQueryKey, saveProfile, type Profile, getListBenefitsQueryKey, useListBenefits, getGetBenefitQueryKey, getGetRecommendationsQueryKey, getGetServiceStateQueryKey, getListTrackingQueryKey, saveTracking,
  useGetBenefit, useGetRecommendations, useListTracking, type TrackingInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { useServiceStateView } from '@/lib/service';
import { Badge, Box, Btn, Chip, Disclaimer, ErrorState, Loading, Notice, Page, T, Toggle, Wrap } from '@/components/ui';
import { STAGES, USER_RECORD_NOTICE, apiErrorMessage } from '@/lib/text';
import { fmtDate } from '@/lib/util';
import { freeIds, hasConditions, useDraftProfile, won } from '@/lib/estimate';
import { confirmAsk } from '@/lib/confirm';
import { errStatus } from '@/lib/util';
import { Collapsible, dday } from '@/components/BenefitCard';
import { InfoAdd, nextQuestion } from '@/components/InfoAdd';
import { DocList, useMyDocuments } from '@/components/DocList';

export default function BenefitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const svc = useServiceStateView();
  const all = useListBenefits(undefined, { query: { queryKey: getListBenefitsQueryKey() } });
  const draft = useDraftProfile(acc.me?.id ?? null, id);
  const q = useGetBenefit(id ?? '', { query: { queryKey: getGetBenefitQueryKey(id ?? ''), enabled: !!id } });
  const recs = useGetRecommendations({ query: { queryKey: getGetRecommendationsQueryKey(), enabled: acc.active } });
  const tracks = useListTracking({ query: { queryKey: getListTrackingQueryKey(), enabled: acc.isSignedIn } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ ok: boolean; title: string; body: string; reasons: string[]; needInfo?: boolean; needDocs?: boolean; ready?: boolean; requestId?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const { user } = useUser();
  // 계약 고객의 서류함. 이 공고의 서류를 모두 올려야 회사에 요청할 수 있다.
  const myDocs = useMyDocuments(!!acc.me?.entitlement.contractActive);
  const [lackNow, setLackNow] = useState<number | null>(null);
  // 서류를 다 올리면 '서류를 등록해 주세요' 안내를 닫는다.
  useEffect(() => { if (applied?.needDocs && lackNow === 0) setApplied({ ok: false, title: '서류를 모두 올렸어요', body: '이제 회사에 요청할 수 있어요', reasons: [], ready: true }); }, [applied?.needDocs, lackNow]);

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
  // 가입 전에도 내 조건으로 찾은 위쪽 3건은 정리본 전체를 열어 준다.
  const myProfile = hasConditions(acc.me?.profile) ? acc.me!.profile : hasConditions(draft) ? draft : null;
  const unlocked = acc.active || freeIds(all.data ?? [], myProfile).has(b.id);
  const expiredMember = acc.isSignedIn && !acc.active && !!svc.data?.trialUsed;
  const closed = dd.label === '마감';
  const period = b.startsAt || b.endsAt ? `${b.startsAt ? fmtDate(b.startsAt) : '시작일 확인 필요'} ~ ${b.endsAt ? fmtDate(b.endsAt) : b.status === '상시 조회' ? '상시' : '마감일 공고 없음'}` : b.status === '상시 조회' ? '상시 조회' : '기간 확인 필요';
  const info: [keyof typeof Feather.glyphMap, string, string][] = [
    ['file-text', '지원형태', b.kind], ['home', '지원기관', b.agency],
    ['map-pin', '지역', b.region], ['activity', '접수상태', closed ? '마감' : b.status],
  ];
  const amountText = !unlocked ? '가입 후 확인' : b.maxAmount ? `최대 ${won(b.maxAmount)}` : '공고에서 확인';
  const best = myRecs.find((r) => r.result === '조건 일치') ?? myRecs.find((r) => r.result === '추가 확인 필요');
  // 신청하기: 서버가 최신 조건으로 다시 판단한다. 되면 회사 접수함에 저장되고, 안 되면 이유를 보여준다.
  // 회사 신청 도움: 이 공고에 꼭 필요한 정보가 비어 있으면 먼저 "정보 추가"로 고르게 한다.
  // 고른 정보는 고객 정보에 쌓여서 다른 공고에서는 다시 묻지 않는다.
  const helpBusinessId = (myRecs.find((r) => r.result === '조건 일치') ?? myRecs.find((r) => r.result === '추가 확인 필요') ?? myRecs[0])?.businessId ?? acc.me?.profile.businesses[0]?.id ?? '';
  const send = async (kind: '신청 지원' | '자격 확인'): Promise<void> => {
    try {
      const res = (await createServiceRequest({ benefitId: b.id, businessId: helpBusinessId, kind, confirmed: true })) as unknown as { id?: string; message?: string };
      await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
      setApplied({ ok: true, title: '회사에 요청이 접수됐어요', body: `${res.id ? `접수번호 ${res.id}. ` : ''}${kind === '자격 확인' ? '담당자가 나머지 조건을 확인해요.' : '담당자를 배정하고 있어요.'}\n기관 신청은 아직이에요.`, reasons: [], requestId: res.id });
      setCopied(false);
    } catch (e) {
      const detail = (e as { data?: { detail?: { result?: string; exclusions?: string[]; unknowns?: string[]; missingDocuments?: string[] } } }).data?.detail;
      if (errStatus(e) === 409 && detail?.result === '서류 필요') askDocs(detail.missingDocuments ?? []);
      else if (errStatus(e) === 409 && detail?.result === '대상 제외') setApplied({ ok: false, title: '이 지원금은 신청할 수 없어요', body: '내 정보와 공고 조건이 달라요.', reasons: detail.exclusions ?? [] });
      // 고객이 답할 수 없는 확인 사항(예산·접수 상태 등)만 남았으면 담당자 확인으로 넘긴다.
      else if (errStatus(e) === 409 && detail && kind === '신청 지원') await send('자격 확인');
      else setApplied({ ok: false, title: '요청하지 못했어요', body: errStatus(e) === 409 ? '마감됐거나 조건이 바뀌었어요.' : apiErrorMessage(e, '저장하지 못했어요. 다시 시도해 주세요.'), reasons: [] });
    }
  };
  const sheetOpen = asking || !!applied;
  const closeSheet = () => { setAsking(false); setApplied(null); };
  // 접수 뒤 회사 카카오톡 채널로 보낼 내용. 앱이 고객 대신 카카오톡을 보낼 수는 없어서, 복사해 두고 채팅창을 열어 준다.
  const kakaoUrl = /^https:\/\//.test(svc.data?.company?.kakao ?? '') ? (svc.data?.company?.kakao as string) : '';
  const notifyText = `[이로운사람들 신청 도움 요청]\n이름: ${user?.firstName ?? ''}\n연락처: ${(user?.primaryPhoneNumber?.phoneNumber ?? '').replace(/^\+82/, '0')}\n지원사업: ${b.title}\n접수번호: ${applied?.requestId ?? ''}\n서류: ${b.documents.length ? `${b.documents.length}가지 등록 완료` : '해당 없음'}`;
  const notifyKakao = async () => {
    try { await Clipboard.setStringAsync(notifyText); setCopied(true); } catch { /* 복사가 막힌 환경에서는 화면의 글을 길게 눌러 복사한다 */ }
    if (kakaoUrl) Linking.openURL(kakaoUrl).catch(() => {});
  };
  const askDocs = (lack: string[]) => setApplied({ ok: false, title: `서류 ${lack.length}가지를 등록해 주세요`, body: '아래에서 바로 올릴 수 있어요', reasons: lack, needDocs: true });
  const lackCount = myDocs.missing(b.documents).length;
  if (lackCount !== lackNow) setLackNow(lackCount);
  const startHelp = () => {
    const me = acc.me;
    if (!me || applying) return;
    if (!me.profile.businesses.length) { router.push('/onboarding'); return; }
    const need = nextQuestion(b, me.profile, helpBusinessId).left;
    if (need > 0) { setAsking(false); setApplied({ ok: false, title: '정보를 조금만 더 알려 주세요', body: `${need}가지만 고르면 돼요`, reasons: [], needInfo: true }); return; }
    const lack = myDocs.missing(b.documents);
    if (lack.length) { askDocs(lack); return; }
    confirmAsk('회사에 신청 도움을 요청할까요?', '담당자가 확인하고 도와드려요.', '요청하기', async () => { setApplying(true); await send('신청 지원'); setApplying(false); });
  };
  const infoDone = async (next: Profile) => {
    setApplying(true);
    try {
      await saveProfile(next);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetRecommendationsQueryKey() });
      setAsking(false);
      const lack = myDocs.missing(b.documents);
      if (lack.length) askDocs(lack); else await send('신청 지원');
    } catch (e) { setApplied({ ok: false, title: '저장하지 못했어요', body: apiErrorMessage(e, '다시 시도해 주세요.'), reasons: [], needInfo: true }); }
    setApplying(false);
  };
  // 고객이 할 일을 순서대로. 공고 자료에 있는 내용만으로 만들고, 없는 내용은 공식 원문 확인으로 안내한다.
  const conditions = [...b.rules.map((r) => r.label), ...b.checks];
  // 회사 신청 도움은 계약 고객만 요청할 수 있다.
  const contract = !!acc.me?.entitlement.contractActive;
  const steps: { title: string; body: string }[] = closed ? [
    { title: '마감됐어요', body: '지금은 신청할 수 없어요' },
    { title: '다른 지원금 보기', body: '지원금 탭에서 확인하세요' },
  ] : [
    { title: '대상 확인', body: conditions.length ? `${conditions.slice(0, 2).join('\n')}${conditions.length > 2 ? `\n외 ${conditions.length - 2}가지` : ''}` : '공식 페이지에서 확인' },
    { title: '서류 준비', body: b.documents.length ? b.documents.join('\n') : '공식 페이지에서 확인' },
    { title: b.endsAt ? `${fmtDate(b.endsAt)}까지 신청` : '신청하기', body: `아래 '공식 신청 페이지' 버튼${b.budgetStatus === '확인 필요' ? '\n예산이 먼저 끝날 수 있어요' : ''}` },
    ...(contract ? [{ title: '어려우면 도움 요청', body: "아래 '회사에 신청 도움 요청' 버튼" }] : []),
    { title: '결과 확인', body: `${b.agency}에서 알려줘요` },
  ];

  return (
    <Page
      back
      right={
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
      }
      footer={<>
        {!closed && contract ? <Btn kind="secondary" label="회사에 신청 도움 요청" icon="send" loading={applying} onPress={startHelp} testID="detail-company-help" /> : null}
        {!closed && !acc.active ? <Btn kind="secondary" label={expiredMember ? '계속 이용하기' : '무료로 전체 보기'} onPress={() => router.push((expiredMember ? '/membership' : acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never)} testID="detail-join" /> : null}
        <Btn label="공식 신청 페이지" icon="external-link" onPress={() => Linking.openURL(b.sourceUrl)} testID="open-source" hint="브라우저에서 공식 페이지가 열립니다" />
      </>}
    >

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
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable accessibilityLabel="닫기" onPress={closeSheet} style={{ flex: 1 }} />
          <View testID="help-sheet" style={{ backgroundColor: c.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%', paddingBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, minHeight: 56 }}>
              <T v="h3" style={{ flex: 1 }}>회사에 신청 도움 요청</T>
              <Pressable testID="help-sheet-close" accessibilityRole="button" accessibilityLabel="닫기" onPress={closeSheet} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="x" size={22} color={c.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {asking && acc.me ? <InfoAdd benefit={b} profile={acc.me.profile} businessId={helpBusinessId} busy={applying} onDone={infoDone} onCancel={() => setAsking(false)} /> : null}
              {applied && !asking ? (
                <View testID="apply-result" accessibilityLiveRegion="polite" style={{ backgroundColor: applied.ok ? c.successSoft : applied.needInfo || applied.needDocs || applied.ready ? c.primarySoft : c.destructiveSoft, borderRadius: c.radius + 2, padding: 16, gap: 6 }}>
                  <T v="h2" color={applied.ok ? c.success : applied.needInfo || applied.needDocs || applied.ready ? c.primary : c.destructive}>{applied.title}</T>
                  <T>{applied.body}</T>
                  {!applied.needDocs ? applied.reasons.map((x, i) => <T key={i} v="small">• {x}</T>) : null}
                  {applied.needInfo ? <Btn label="정보 추가" icon="plus" onPress={() => setAsking(true)} testID="apply-add-info" /> : null}
                  {applied.ready ? <Btn label="회사에 요청하기" icon="send" loading={applying} onPress={async () => { setApplying(true); await send('신청 지원'); setApplying(false); }} testID="apply-send" /> : null}
                  {!applied.ok && !applied.needInfo && !applied.needDocs && !applied.ready ? <Btn kind="ghost" label="정보 수정" onPress={() => { closeSheet(); router.push('/onboarding'); }} testID="apply-fix" /> : null}
                </View>
              ) : null}
              {applied?.needDocs && !asking ? (
                <View style={{ backgroundColor: c.card, borderRadius: c.radius + 2, paddingHorizontal: 14 }}>
                  <DocList names={b.documents} canUpload />
                </View>
              ) : null}
              {applied?.ok && !asking ? (
                <View testID="apply-notify" style={{ backgroundColor: c.card, borderRadius: c.radius + 2, padding: 16, gap: 8 }}>
                  <T v="label">카카오톡으로 한 번만 알려 주세요</T>
                  <T v="small" color={c.mutedForeground}>아래 내용이 복사돼요. 채팅창에 붙여넣고 보내면 끝이에요.</T>
                  <View style={{ backgroundColor: c.secondary, borderRadius: 10, padding: 12 }}><T v="small" selectable testID="apply-notify-text">{notifyText}</T></View>
                  {kakaoUrl ? <Btn label={copied ? '복사됨 · 카카오톡 열기' : '복사하고 카카오톡 열기'} icon="message-circle" onPress={notifyKakao} testID="apply-kakao" /> : <Btn label={copied ? '복사됨' : '내용 복사하기'} icon="copy" onPress={notifyKakao} testID="apply-copy" />}
                  <Btn kind="ghost" label="접수 내역 보기" onPress={() => { closeSheet(); router.push('/company-progress'); }} testID="apply-progress" />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
      </View>

      <View testID="detail-key" style={{ backgroundColor: c.primarySoft, borderRadius: c.radius + 4, padding: 18, gap: 12 }}>
        <View style={{ gap: 2 }}>
          <T v="small" color={c.primary}>지원금액</T>
          <T v="title" color={c.primary} testID="detail-amount">{amountText}</T>
        </View>
        <View style={{ height: 1, backgroundColor: '#C9D8FB' }} />
        <View style={{ gap: 2 }}>
          <T v="small" color={c.primary}>신청기간</T>
          <T v="h3" testID="detail-period">{period}</T>
        </View>
      </View>

      {b.summary ? (
        <Box title="어떤 지원인가요?">
          <T testID="detail-summary">{b.summary}</T>
        </Box>
      ) : null}

      <Box title="지원내용">
        <T>{b.support || '공식 페이지에서 확인'}</T>
        <T v="small" color={c.mutedForeground}>금액은 기관이 정해요</T>
      </Box>

      {unlocked ? (
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
            <T v="label" color={c.primary}>서류와 신청 순서는{'\n'}{expiredMember ? '이용 중에' : '가입하면'} 볼 수 있어요</T>
            <Btn label={expiredMember ? '계속 이용 문의하기' : '무료로 전체 보기'} onPress={() => router.push((expiredMember ? '/inquiries' : acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never)} testID="detail-access" />
          </View>
        </Box>
      ) : null}

      {unlocked ? (
        <>
      <Box title="필요 서류">
        {b.documents.length === 0 ? <T>공식 페이지에서 확인</T> : (
          <>
            {contract ? <T v="small" color={myDocs.missing(b.documents).length ? c.mutedForeground : c.success} testID="docs-status">{myDocs.missing(b.documents).length ? `${b.documents.length}가지 중 ${b.documents.length - myDocs.missing(b.documents).length}가지 등록 · 모두 올리면 회사에 요청할 수 있어요` : '모두 등록했어요 · 회사에 요청할 수 있어요'}</T> : null}
            <DocList names={b.documents} canUpload={contract} />
          </>
        )}
      </Box>

      <Box title="확인할 사항">
        {b.checks.length === 0 && b.rules.length === 0 ? <T>공식 출처에서 확인해 주세요.</T> : null}
        {b.checks.map((x, i) => <T key={i}>• {x}</T>)}
        {b.rules.map((r, i) => <T key={`rule${i}`}>• {r.label} ({r.scope === 'business' ? '사업장' : '개인·가구'})</T>)}
      </Box>

      <Box title="내 조건과 비교">
        {acc.active ? (
          recs.isLoading ? <Loading rows={1} /> : recs.error ? <ErrorState message={apiErrorMessage(recs.error)} onRetry={() => recs.refetch()} /> : myRecs.length === 0 ? (
            <T>아직 비교 결과가 없어요</T>
          ) : myRecs.map((r) => (
            <View key={`${r.benefitId}-${r.businessId}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Badge label={r.result} tone={tone(r.result)} />
                {r.businessId ? <T v="small" style={{ fontWeight: '700' }}>{bizName(r.businessId)}</T> : null}
              </View>
              {r.reasons.length > 0 ? <T v="label">맞는 점</T> : null}
              {r.reasons.map((x, i) => <T key={`r${i}`} v="small">• {x}</T>)}
              {r.unknowns.length > 0 ? <T v="label">확인할 점</T> : null}
              {r.unknowns.map((x, i) => <T key={`u${i}`} v="small">• {x}</T>)}
              {r.exclusions.length > 0 ? <T v="label">다른 점</T> : null}
              {r.exclusions.map((x, i) => <T key={`e${i}`} v="small" color={c.destructive}>• {x}</T>)}
            </View>
          ))
        ) : (
          <>
            <T>가입하면 내 조건과 비교해 드려요</T>
            <Btn kind="secondary" label="무료로 비교해 보기" onPress={() => router.push((acc.isSignedIn ? '/start-trial' : '/auth?mode=signup&next=/start-trial') as never)} testID="detail-access" />
          </>
        )}
        <T v="small" color={c.mutedForeground}>최종 선정은 기관이 정해요</T>
      </Box>

        </>
      ) : null}

      {b.calculation ? <Box title="금액 산정"><Collapsible text={b.calculation} testID="calc-more" /></Box> : null}

      {acc.isSignedIn ? (
        <Btn kind="secondary" icon="bookmark" label={base.saved ? '저장됨 · 눌러서 해제' : '저장하기'} loading={busy} onPress={() => save({ saved: !base.saved }, base.saved ? '저장을 해제했어요.' : '저장했어요.')} testID="save-button" />
      ) : null}

      <Box title="공식 출처">
        <T>{b.agency} 공고예요</T>
        <T>신청과 선정은 기관이 합니다</T>
        <T v="small" color={c.mutedForeground}>확인일 {fmtDate(b.checkedAt)}</T>
      </Box>
      <Disclaimer />
    </Page>
  );
}
