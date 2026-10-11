import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  createOwnerCode, getGetMeQueryKey, getGetServiceStateQueryKey, saveServiceConsent, startTrial,
} from '@workspace/api-client-react';
import { Badge, Btn, Card, Loading, Notice, Page, Section, T, Toggle } from '@/components/ui';
import { Pending, AuthGate, NotGovernment, QueryProblem, ServiceLinks, ContactButtons } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { apiErrorMessage } from '@/lib/text';
import { kst, remaining, status, useServiceStateView } from '@/lib/service';

function Body() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useServiceStateView();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [code, setCode] = useState<{ code: string; message: string } | null>(null);

  if (error) return <QueryProblem error={error} next="/access" onRetry={() => refetch()} />;
  if (isLoading || !data) return <Pending onRetry={() => refetch()} />;

  const ent = data.account.entitlement;
  const kind = ent.contractActive ? 'contract' : ent.trialActive ? 'trial' : ent.active ? 'other' : 'free';
  const end = kind === 'contract' ? ent.contractUntil : kind === 'trial' ? ent.trialUntil : ent.grantActive ? ent.grantUntil : ent.subscriptionUntil;
  const prof = data.account.profile;
  const hasInfo = (prof?.step ?? 0) >= 1 || !!prof?.personal?.province || (prof?.businesses?.length ?? 0) > 0;
  const privacy = !!data.account.preferences.privacyConsent;
  const latestService=data.consents.find(h=>h.kind==="service");
  const canTrial = !data.trialUsed && !ent.active && hasInfo && privacy&&latestService?.accepted===true&&latestService.version===data.consentVersion;
  const consent = (k: string) => data.consents.find((x) => x.kind === k)?.accepted ?? false;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try {
      await fn();
      await Promise.all([qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() }), qc.invalidateQueries({ queryKey: getGetMeQueryKey() })]);
      setMsg({ t: 'ok', s: ok });
    } catch (e) {
      setMsg({ t: 'error', s: status(e) === 409 ? '이미 처리된 요청입니다. 화면을 새로 확인해 주세요.' : apiErrorMessage(e) });
    }
    setBusy(null);
  };
  const setConsent = (kind: 'service' | 'marketing', accepted: boolean) =>
    run(`c-${kind}`, () => saveServiceConsent({ kind, accepted, version: data.consentVersion }), accepted ? '동의를 저장했습니다.' : '동의를 철회했습니다.');

  return (
    <>
      <Card tone="soft" style={{ gap: 8 }}>
        <T v="small" color={c.mutedForeground}>지금 이용 상태</T>
        <T v="title" testID="svc-status-label">{kind === 'contract' ? '계약회원' : kind === 'trial' ? '3일 무료체험' : kind === 'other' ? '기존 구독 이용 중' : '무료'}</T>
        {kind === 'trial' && ent.trialStartedAt ? <T>시작: {kst(ent.trialStartedAt)} (한국 시간)</T> : null}
        {ent.active && end ? <T>끝나는 때: {kst(end)} (한국 시간)</T> : null}
        {ent.active && end ? <Badge tone="info" label={remaining(end, data.account.serverNow ?? new Date().toISOString())} /> : null}
        {!ent.active ? <T>공고 보기는 무료입니다. 맞춤 확인은 체험이나 회사 계약 후 쓸 수 있습니다.</T> : null}
      </Card>
      {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}

      {!ent.active ? (
        <Section title="3일 무료체험">
          <Card>
            <T>체험은 한 번만 쓸 수 있고, 시작하면 3일(72시간) 동안 맞춤 확인이 열립니다. 알림 허용 여부와는 관계없습니다.</T>
            {data.trialUsed ? <Notice tone="warn" title="이미 체험을 사용했습니다">다시 체험할 수 없어요. 상담에 문의해 주세요.</Notice> : null}
            {!data.trialUsed && !hasInfo ? <Notice tone="warn" title="내 정보가 먼저 필요해요">거주지나 사업장 정보를 한 단계라도 입력해 주세요.</Notice> : null}
            {!data.trialUsed && !privacy ? <Notice tone="warn" title="개인정보 동의가 필요해요">내 정보 화면에서 동의를 켜 주세요.</Notice> : null}
            {!data.trialUsed && latestService?.accepted!==true ? <Notice tone="warn">아래 동의 관리에서 필요한 서비스 동의를 확인해 주세요. 선택 마케팅은 거절해도 됩니다.</Notice>:null}
            <T v="small">계정과 확인된 이메일 기준으로 한 번만 체험할 수 있습니다. 다른 이메일이 같은 사람인지 자동으로 확인하지는 못합니다.</T>
            {!data.trialUsed && !hasInfo ? <Btn kind="secondary" label="내 정보 입력하러 가기" icon="edit-3" testID="svc-go-onboarding" onPress={() => router.push('/onboarding')} /> : null}
            {!data.trialUsed && !privacy ? <Btn kind="secondary" label="내 정보에서 동의하기" icon="shield" testID="svc-go-privacy" onPress={() => router.push('/(tabs)/account')} /> : null}
            <Btn label="3일 무료체험 시작하기" icon="play" testID="svc-start-trial" disabled={!canTrial} loading={busy === 'trial'}
              onPress={() => run('trial', () => startTrial({}), '체험을 시작했습니다. 시작과 끝 시각은 위에 표시됩니다.')} />
          </Card>
        </Section>
      ) : null}

      <Section title="동의 관리">
        <Card>
          <T v="small">필요한 서비스 동의와 선택 마케팅 동의는 따로 저장됩니다. 마케팅이나 기기 알림을 거절해도 체험은 막히지 않습니다.</T>
          <Toggle testID="svc-consent-service" label="필요 서비스 동의" desc={data.consentTexts.service} value={consent('service')} disabled={busy === 'c-service'} onChange={(v) => setConsent('service', v)} />
          <Toggle testID="svc-consent-marketing" label="선택 마케팅 동의" desc={data.consentTexts.marketing} value={consent('marketing')} disabled={busy === 'c-marketing'} onChange={(v) => setConsent('marketing', v)} />
          <View style={{ height: 1, backgroundColor: c.border }} />
          <T v="label">동의 기록</T>
          {data.consents.length === 0 ? <T v="small" color={c.mutedForeground}>아직 기록이 없습니다.</T> : data.consents.map((h, i) => (
            <T key={`${h.kind}${h.recorded_at}${i}`} v="small">{h.kind === 'service' ? '필요 서비스' : '선택 마케팅'} · {h.accepted ? '동의' : '철회'} · {kst(h.recorded_at)}</T>
          ))}
        </Card>
      </Section>

      <Section title="계정 연결번호">
        <Card>
          <T>회사 담당자가 계약을 연결할 때 필요한 번호입니다. 15분 동안만 쓸 수 있고, 본인이 직접 담당자에게만 알려 주세요.</T>
          {code ? (
            <View style={{ gap: 6 }}>
              <T v="hero" selectable testID="svc-owner-code">{code.code}</T>
              <T v="small" color={c.mutedForeground}>{code.message}</T>
            </View>
          ) : null}
          <Btn label={code ? '새 번호 받기' : '연결번호 받기'} icon="key" testID="svc-owner-code-btn" loading={busy === 'code'}
            onPress={async () => {
              setBusy('code'); setMsg(null);
              try { const r = (await createOwnerCode()) as unknown as { code: string; message: string }; setCode({ code: r.code, message: r.message }); }
              catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
              setBusy(null);
            }} />
        </Card>
      </Section>

      <Section title="구독 안내">
        <Card>
          <T>새 월 구독은 현재 판매하지 않습니다. 이미 구독한 분의 복원·관리는 계속 쓸 수 있습니다.</T>
          <Btn label="새 구독 구매 (현재 판매 안함)" icon="lock" disabled testID="svc-buy-disabled" onPress={() => {}} />
          <Btn kind="secondary" label="기존 구독 복원·관리" icon="award" testID="svc-go-membership" onPress={() => router.push('/membership')} />
        </Card>
      </Section>

      <Section title="회사 연락처">
        <Card><ContactButtons phone={data.company?.phone} kakao={data.company?.kakao} prefix="svc-company" /></Card>
      </Section>
      {data.limitations ? <Notice tone="info" title="알아두세요">{Array.isArray(data.limitations) ? data.limitations.join(' ') : String(data.limitations)}</Notice> : null}
      <ServiceLinks current="/access" />
          </>
  );
}

export default function Access() {
  return (
    <Page back title="이용 상태" subtitle="무료, 72시간 체험, 계약회원 중 어디인지 알려드려요.">
      <NotGovernment />
      <AuthGate next="/access"><Body /></AuthGate>
    </Page>
  );
}
