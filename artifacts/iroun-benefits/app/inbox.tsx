import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, getGetServiceStateQueryKey, readServiceInbox, savePreferences } from '@workspace/api-client-react';
import type { Preferences } from '@workspace/api-client-react';
import { Badge, Btn, Card, Empty, Loading, Notice, Page, Section, T, Toggle } from '@/components/ui';
import { Pending, AuthGate, NotGovernment, QueryProblem, ServiceLinks } from '@/components/service-ui';
import { useColors } from '@/hooks/useColors';
import { registerNativeNotifications } from '@/lib/native-notifications';
import { apiErrorMessage } from '@/lib/text';
import { kst, useServiceStateView } from '@/lib/service';

function useOsPermission() {
  const [perm, setPerm] = useState<string>(Platform.OS === 'web' ? '웹에서는 확인하지 않았습니다' : '확인 중');
  const check = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const N = require('expo-notifications') as typeof import('expo-notifications');
      const r = await N.getPermissionsAsync();
      setPerm(r.granted ? '허용됨' : r.canAskAgain === false ? '꺼져 있음 (기기 설정에서 켜야 합니다)' : '아직 허용하지 않음');
    } catch { setPerm('확인하지 못했습니다 (Expo Go에서는 미검증)'); }
  }, []);
  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => sub.remove();
  }, [check]);
  return { perm, check };
}

function Body() {
  const os = useOsPermission();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { acc, data, error, isLoading, refetch } = useServiceStateView();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'error' | 'info'; s: string } | null>(null);

  if (error) return <QueryProblem error={error} next="/inbox" onRetry={() => refetch()} />;
  if (isLoading || !data || !acc.me) return <Pending onRetry={() => refetch()} />;
  const prefs = acc.me.preferences;

  const open = async (id: string) => {
    setBusy(id); setMsg(null);
    try {
      const r = (await readServiceInbox(id)) as unknown as { benefitId?: string };
      await qc.invalidateQueries({ queryKey: getGetServiceStateQueryKey() });
      if (r.benefitId && /^[a-zA-Z0-9_-]{1,80}$/.test(r.benefitId)) router.push({ pathname: '/benefit/[id]', params: { id: r.benefitId } });
      else setMsg({ t: 'error', s: '연결된 공고를 찾지 못했습니다.' });
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(null);
  };
  const setPref = async (patch: Partial<Preferences>) => {
    setBusy('pref'); setMsg(null);
    try {
      const merged: Preferences = { ...prefs, ...patch };
      if (patch.notifications === false) merged.personalizedAlerts = false;
      await savePreferences(merged);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setMsg({ t: 'ok', s: '알림 설정을 저장했습니다.' });
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setBusy(null);
  };
  const registerDevice = async () => {
    setBusy('os'); setMsg(null);
    try { setMsg({ t: 'info', s: await registerNativeNotifications() }); await os.check(); } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e, '기기 등록을 하지 못했습니다.') }); }
    setBusy(null);
  };
  const native = Platform.OS !== 'web';

  return (
    <>
      {!data.pushDelivery?.enabled ? <Notice tone="warn" title="실제 푸시 발송은 아직 꺼져 있어요">운영자 푸시 자격증명·프로젝트 설정 전에는 휴대전화 상단 알림이 오지 않습니다. 알림에는 이름과 금액을 넣지 않습니다.</Notice> : null}
      {data.pushDelivery ? <Section title="내 계정의 휴대전화 알림 전송 상태">
        <Notice tone={data.pushDelivery.state === 'failed' || data.pushDelivery.state === 'unknown' ? 'warn' : 'info'}>
          {data.pushDelivery.message}
        </Notice>
        <Btn kind="secondary" label="전송 상태 다시 확인" onPress={() => { void refetch(); }} testID="svc-push-status-refresh" />
      </Section> : null}
      {msg ? <Notice tone={msg.t === 'info' ? 'info' : msg.t}>{msg.s}</Notice> : null}
      <Section title="받은 알림">
        {!acc.active ? <Notice tone="warn" title="맞춤 알림은 이용 중일 때 보여요">이용 상태 화면에서 체험이나 계약을 확인해 주세요.</Notice> : data.inbox.length === 0 ? (
          <Empty icon="bell" title="새 알림이 없어요" body="내 조건에 맞는 공고가 생기면 이곳에 알려드려요." />
        ) : data.inbox.map((n) => (
          <Card key={n.id}>
            <Badge label={n.read_at ? '읽음' : '새 알림'} tone={n.read_at ? 'muted' : 'ok'} />
            <T v="h3">{n.title}</T>
            <T v="small" color={c.mutedForeground}>{kst(n.created_at)}</T>
            <Btn label="공고 열기" icon="chevron-right" testID={`svc-inbox-open-${n.id}`} loading={busy === n.id} onPress={() => open(n.id)} />
          </Card>
        ))}
      </Section>
      <Section title="알림 설정">
        <Card>
          <Toggle testID="svc-pref-notifications" label="앱 안 알림 받기" desc="알림함에 받겠다는 뜻을 저장합니다." value={prefs.notifications} disabled={busy === 'pref'} onChange={(v) => setPref({ notifications: v })} />
          <Toggle testID="svc-pref-personalized" label="맞춤 알림" desc={acc.active ? '내 조건에 맞는 새 공고를 알려드려요.' : '이용 중일 때만 켤 수 있어요.'} value={prefs.personalizedAlerts && acc.active} disabled={busy === 'pref' || !acc.active || !prefs.notifications} onChange={(v) => setPref({ personalizedAlerts: v })} />
        </Card>
        <Card>
          <T v="label">이 기기의 알림 권한</T>
          <T v="small" color={c.mutedForeground}>{`현재 상태: ${os.perm}. `}{native ? '원할 때만 이 기기를 등록합니다. 거절해도 체험과 이용에는 영향이 없어요.' : '웹에서는 기기 알림을 확인하지 않았습니다.'}</T>
          <Btn kind="secondary" icon="smartphone" label="이 기기 알림 등록하기" testID="svc-register-device" disabled={!native || !prefs.notifications || !prefs.personalizedAlerts || !acc.active} loading={busy === 'os'} onPress={registerDevice} />
          {native ? <Btn kind="secondary" icon="settings" label="기기 설정 열기" testID="svc-open-settings" onPress={() => Linking.openSettings()} /> : null}
        </Card>
      </Section>
      <ServiceLinks current="/inbox" />
    </>
  );
}

export default function Inbox() {
  return (
    <Page back title="알림함" subtitle="앱 안에서 받은 맞춤 알림이에요.">
      <NotGovernment />
      <AuthGate next="/inbox"><Body /></AuthGate>
    </Page>
  );
}
