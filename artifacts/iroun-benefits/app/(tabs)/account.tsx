import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, savePreferences, type Preferences } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount, useSignOutFlow } from '@/lib/session';
import { clearDraft } from '@/lib/draft';
import { FooterLinks } from '@/components/ui';
import { useSettings } from '@/lib/settings';
import { Btn, Card, Disclaimer, ErrorState, ListRow, Loading, Notice, Page, Section, T, Toggle } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import { registerNativeNotifications } from '@/lib/native-notifications';

export default function Account() { return <AccountView settings={false} />; }

/** 내 정보(하단 탭)와 환경설정(내 정보 맨 아래에서 들어감)을 같은 틀로 그린다. */
export function AccountView({ settings }: { settings: boolean }) {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const { user } = useUser();
  const { largeText, setLargeText } = useSettings();
  const signOut = useSignOutFlow();
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; s: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [outBusy, setOutBusy] = useState(false);

  const setPref = async (patch: Partial<Preferences>) => {
    if (!acc.me) return;
    setSaving(true); setMsg(null);
    // 알림을 끄면 맞춤 알림도 함께 끈다(한 번의 요청으로 처리).
    const merged = { ...acc.me.preferences, ...patch };
    if (patch.notifications === false) merged.personalizedAlerts = false;
    try {
      let savedMessage='설정을 저장했습니다.';
      await savePreferences(merged);
      if(patch.notifications===true&&acc.active){
        const message=await registerNativeNotifications();
        savedMessage=message;
      }
      if (patch.privacyConsent === false) await clearDraft();
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setMsg({ t: 'ok', s: savedMessage });
    } catch (e) { setMsg({ t: 'error', s: apiErrorMessage(e) }); }
    setSaving(false);
  };

  const p = acc.me?.profile;
  const textToggle = (
    <Toggle testID="large-text-toggle" label="큰 글씨 모드" desc="모든 글자를 더 크게" value={largeText} onChange={(v) => { setLargeText(v); if (acc.me) void setPref({ largeText: v }); }} />
  );

  return (
    <Page back title={settings ? '환경설정' : '내 정보'}>
      {!acc.isLoaded || (acc.isSignedIn && acc.loading) ? <Loading rows={2} /> : !acc.isSignedIn ? (
        <Card tone="soft">
          <T v="h3">가입하면 전체 지원금을 볼 수 있어요</T>
          <Btn label="로그인" icon="log-in" onPress={() => router.push('/auth')} testID="account-login" />
          <Btn kind="secondary" label="새로 가입" icon="user-plus" onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })} testID="account-signup" />
        </Card>
      ) : acc.error ? <ErrorState message={apiErrorMessage(acc.error)} onRetry={() => acc.refetch()} /> : acc.me ? (
        <>
          {!settings ? <>
          <Card>
            <T v="small" color={c.mutedForeground}>{user?.firstName ? `${user.firstName}님의 정보` : '로그인한 계정'}</T>
            <T v="h3" selectable>{user?.primaryPhoneNumber?.phoneNumber ?? user?.primaryEmailAddress?.emailAddress ?? '확인 중'}</T>
            <View style={{ height: 1, backgroundColor: c.border }} />
            <T v="label">회원 이용권</T>
            <T color={acc.active ? c.success : c.mutedForeground}>
              {acc.active ? (acc.me.entitlement.grantActive && !acc.me.entitlement.subscriptionActive ? '무상 이용권 사용 중' : '이용 중') : '이용권 없음'}
            </T>
            <Btn kind="secondary" label="이용권 안내·관리" icon="award" onPress={() => router.push('/membership')} testID="account-membership" />
          </Card>

          <Section title="내 사업장">
            <Card>
              <T v="label">고른 조건</T>
              {p && p.businesses.length > 0 ? p.businesses.map((b) => (
                <T key={b.id}>{[b.industry, b.province && `${b.province} ${b.district ?? ''}`.trim(), b.openedYear && (b.openedYear <= 2009 ? '2009년 이전 개업' : `${b.openedYear}년 개업`), b.revenue, b.employeeBand && `직원 ${b.employeeBand}`, b.premises].filter(Boolean).join(' · ') || '고른 조건 없음'}</T>
              )) : <T>아직 고르지 않았어요</T>}
              <Btn label={p && p.businesses.length ? '조건 수정하기' : '내 사업자 지원금은 얼마일까?'} icon="edit-3" onPress={() => router.push('/onboarding')} testID="account-edit-profile" />
            </Card>
          </Section>
          </> : null}

          {settings ? <Section title="알림 설정">
            <Card>
              <Toggle testID="pref-notifications" label="알림 받기" value={acc.me.preferences.notifications} onChange={(v) => setPref({ notifications: v })} disabled={saving} />
              <Toggle testID="pref-personalized" label="맞춤 알림" desc={acc.active ? '내 조건에 맞는 새 공고' : '이용 중에만 켤 수 있어요'} value={acc.me.preferences.personalizedAlerts && acc.active} onChange={(v) => setPref({ personalizedAlerts: v })} disabled={saving || !acc.active} />
              <T v="small" color={c.mutedForeground}>휴대폰 알림은 준비 중이에요</T>
            </Card>
            {msg ? <Notice tone={msg.t}>{msg.s}</Notice> : null}
          </Section> : null}
        </>
      ) : null}

      {!settings ? <Section title="내 이용">
        <ListRow icon="award" label="이용 상태·동의" onPress={() => router.push('/access')} testID="nav-access" />
        <ListRow icon="target" label="맞춤 공고" onPress={() => router.push('/matches')} testID="nav-matches" />
        <ListRow icon="clipboard" label="회사 진행" onPress={() => router.push('/company-progress')} testID="nav-company-progress" />
        <ListRow icon="folder" label="내 서류함" onPress={() => router.push('/documents' as never)} testID="nav-documents" />
        <ListRow icon="bookmark" label="저장한 공고·내 기록" onPress={() => router.push('/mine')} testID="nav-mine" />
        <ListRow icon="bell" label="알림함" onPress={() => router.push('/inbox')} testID="nav-inbox" />
        {acc.me && acc.me.role !== 'user' && acc.me.role !== 'customer' ? <ListRow icon="briefcase" label="회사 업무" onPress={() => router.push('/office')} testID="nav-office" /> : null}
      </Section> : null}
      {!settings ? <ListRow icon="settings" label="환경설정" onPress={() => router.push('/settings' as never)} testID="nav-settings" /> : null}
      {settings ? <>
      <Section title="화면 설정">
        <Card>{textToggle}</Card>
      </Section>

      <Section title="안내">
        <ListRow icon="shield" label="개인정보처리방침" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} testID="link-privacy" />
        <ListRow icon="file-text" label="이용약관" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} testID="link-terms" />
        <ListRow icon="help-circle" label="고객 지원" onPress={() => router.push({ pathname: '/legal', params: { section: 'support' } })} testID="link-support" />
        <ListRow icon="info" label="서비스 소개" onPress={() => router.push('/about')} testID="link-about" />
      </Section>

      {acc.isSignedIn ? (
        <Section title="계정">
          <Btn kind="secondary" label="로그아웃" icon="log-out" loading={outBusy} onPress={async () => { setOutBusy(true); await signOut('/'); }} testID="sign-out" />
          <Btn kind="ghost" label="회원 탈퇴" icon="user-x" onPress={() => router.push('/delete-account')} testID="go-delete-account" />
        </Section>
      ) : null}
      </> : null}
      <FooterLinks />
      <Disclaimer />
    </Page>
  );
}
