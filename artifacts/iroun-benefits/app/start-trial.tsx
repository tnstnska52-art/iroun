import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  getGetMeQueryKey, getGetServiceStateQueryKey, getMe, savePreferences, saveProfile, saveServiceConsent, startTrial,
} from '@workspace/api-client-react';
import { Btn, Card, Notice, Page, T, Toggle } from '@/components/ui';
import { AuthGate, Pending, QueryProblem } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { loadDraft, saveDraft } from '@/lib/draft';
import { registerNativeNotifications } from '@/lib/native-notifications';
import { apiErrorMessage } from '@/lib/text';
import { status, useServiceStateView } from '@/lib/service';

/** 가입 직후 한 화면에서 동의를 받고 3일 무료체험을 시작한다. 체험은 고객이 직접 버튼을 눌러야 시작된다. */
function Body() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useServiceStateView();
  const [service, setService] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (error) return <QueryProblem error={error} next="/start-trial" onRetry={() => refetch()} />;
  if (isLoading || !data) return <Pending onRetry={() => refetch()} />;
  const ent = data.account.entitlement;
  if (ent.active) {
    return (
      <Card>
        <T v="h3">이미 맞춤 이용 중이에요</T>
                <Btn label="홈으로 가기" onPress={() => router.replace('/')} testID="trial-home" />
      </Card>
    );
  }
  if (data.trialUsed) {
    return (
      <Card>
        <T v="h3">무료체험은 한 번만 쓸 수 있어요</T>
        <T v="small" color={c.mutedForeground}>접수 내역은 계속 볼 수 있어요</T>
        <Btn label="문의 보내기" onPress={() => router.push('/inquiries')} testID="trial-inquiry" />
        <Btn kind="secondary" label="전체혜택 보기" onPress={() => router.replace('/benefits')} />
      </Card>
    );
  }

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const me = await getMe();
      if (!me.preferences.privacyConsent) await savePreferences({ ...me.preferences, privacyConsent: true });
      // 가입 전에 이 기기에서 고른 조건을 내 계정에 저장한다.
      const hasServer = (me.profile.step ?? 0) > 0 || me.profile.businesses.length > 0 || !!me.profile.personal.province;
      const draft = await loadDraft(me.id);
      if (!hasServer && draft?.profile) {
        await saveProfile(draft.profile);
        await saveDraft({ ...draft, consent: true, serverSaved: true }, me.id);
      } else if (!hasServer) { setBusy(false); router.push('/onboarding'); return; }
      await saveServiceConsent({ kind: 'service', accepted: true, version: data.consentVersion });
      if (marketing) await saveServiceConsent({ kind: 'marketing', accepted: true, version: data.consentVersion });
      await startTrial({});
      // 체험 동안 새 공고를 놓치지 않도록 알림을 켠다. 기기 알림 허용은 휴대폰이 따로 묻는다.
      const fresh = await getMe();
      await savePreferences({ ...fresh.preferences, privacyConsent: true, notifications: true, personalizedAlerts: true });
      try { await registerNativeNotifications(); } catch { /* 기기 등록 실패는 체험 시작을 막지 않는다 */ }
      await Promise.all([qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() }), qc.invalidateQueries({ queryKey: getGetMeQueryKey() })]);
      router.replace('/');
    } catch (e) {
      setErr(status(e) === 409 ? '체험을 시작하지 못했어요. 이미 체험을 사용했거나 정보 입력이 더 필요해요.' : apiErrorMessage(e));
      setBusy(false);
    }
  };

  const items: [keyof typeof Feather.glyphMap, string, string][] = [
    ['target', '지원금 전체 목록', '금액까지 모두 보기'],
    ['clock', '놓친 지원금', '작년에 놓친 것 확인'],
    ['list', '신청 순서', '서류와 할 일 정리'],
    ['bell', '새 공고 알림', '뜨면 바로 알림'],
  ];
  return (
    <>
      <Card>
        {items.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 4 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={icon} size={18} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="label">{title}</T>
              <T v="small" color={c.mutedForeground}>{body}</T>
            </View>
          </View>
        ))}
      </Card>
      <Card>
        <Toggle testID="trial-consent-service" label="[필수] 개인정보 처리 동의" desc="고른 조건과 가입 정보를 회사가 관리해요" value={service} onChange={setService} />
        <Toggle testID="trial-consent-marketing" label="[선택] 마케팅 정보 수신 동의" desc="안 해도 무료체험을 쓸 수 있어요" value={marketing} onChange={setMarketing} />
      </Card>
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Btn testID="trial-start" label="동의하고 3일 무료체험 시작" loading={busy} disabled={!service} onPress={start} />
      <T v="small" color={c.mutedForeground} style={{ textAlign: 'center' }}>72시간 무료 · 자동결제 없음</T>
    </>
  );
}

export default function StartTrial() {
  return (
    <Page back title="3일 무료체험">
      <AuthGate next="/start-trial"><Body /></AuthGate>
    </Page>
  );
}
