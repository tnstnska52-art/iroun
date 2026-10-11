import React, { useEffect, useState } from 'react';
import { useAuth, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Btn, Card, Chip, Disclaimer, Field, Notice, Page, T, Toggle, Wrap } from '@/components/ui';
import { getMe, savePreferences } from '@workspace/api-client-react';
import { clerkErrorMessage } from '@/lib/text';
import { markSignIn } from '@/lib/draft';
import { useColors } from '@/hooks/useColors';
import { IS_PREVIEW } from '@/lib/estimate';

type Mode = 'signin' | 'signup';
const CARRIERS = ['SKT', 'KT', 'LG U+', 'SKT 알뜰폰', 'KT 알뜰폰', 'LG U+ 알뜰폰'];

export default function AuthScreen() {
  const c = useColors();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; next?: string; reauth?: string }>();
  const { signIn, fetchStatus: siStatus } = useSignIn();
  const { signUp, fetchStatus: suStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carrier, setCarrier] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'verify' | 'verify2'>('form');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountConsent, setAccountConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [pendingCompletion, setPendingCompletion] = useState(false);
  const next = (params.next && params.next.startsWith('/') ? params.next : '/') as Href;
  const reauth = params.reauth === '1';

  const done = async () => {
    await markSignIn();
    if (mode === 'signup') {
      try {
        const me=await getMe();
        await savePreferences({...me.preferences,accountConsent:true,termsConsent:true});
      } catch {
        setErr('계정은 생성됐지만 동의 기록을 저장하지 못했습니다. 계속하기를 눌러 다시 저장해 주세요.');
        return;
      }
    }
    router.replace(next);
  };
  // Finalize's navigation callback can run before useAuth exposes the new
  // session. Wait for the authenticated render before making protected calls.
  useEffect(() => {
    if (!pendingCompletion || !isSignedIn) return;
    void done().finally(() => setPendingCompletion(false));
  }, [pendingCompletion, isSignedIn]);
  const guard = async (fn: () => Promise<void>) => {
    setErr(null); setInfo(null); setBusy(true);
    try { await fn(); } catch (e) { setErr(clerkErrorMessage(e)); }
    setBusy(false);
  };
  // 카카오로 가입·로그인. 카카오에서 돌아오면 바로 로그인 상태가 된다.
  const doKakao = () => guard(async () => {
    const r = await startSSOFlow({ strategy: 'oauth_custom_kakao' }) // 로그인 서비스에 카카오를 직접 등록해 연결한다;
    if (r.createdSessionId && r.setActive) { await r.setActive({ session: r.createdSessionId }); setMode('signup'); setPendingCompletion(true); }
    else setErr('카카오 로그인을 마치지 못했어요. 다시 시도하거나 휴대폰 번호로 진행해 주세요.');
  });
  const digits = phone.replace(/\D/g, '');
  const phoneOk = /^01[016789]\d{7,8}$/.test(digits);
  const e164 = `+82${digits.slice(1)}`;
  const pwOk = pw.length >= 8;

  const doSignIn = () => guard(async () => {
    const r = await signIn.password({ phoneNumber: e164, password: pw });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: () => setPendingCompletion(true) });
    } else if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
      const f = signIn.supportedSecondFactors?.find((x) => x.strategy === 'phone_code');
      if (f) { await signIn.mfa.sendPhoneCode(); setStep('verify2'); setInfo('문자로 추가 인증번호를 보냈어요.'); }
      else setErr('이 계정은 추가 인증이 필요하지만 앱에서 지원하지 않는 방식입니다.');
    } else setErr('로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
  });
  const verifySignIn = () => guard(async () => {
    const r = await signIn.mfa.verifyPhoneCode({ code: code.trim() });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signIn.status === 'complete') await signIn.finalize({ navigate: () => setPendingCompletion(true) });
  });
  const doSignUp = () => guard(async () => {
    if (!accountConsent || !termsConsent) { setErr('계정 정보 수집 동의와 이용약관 확인이 필요해요.'); return; }
    if (!pwOk) { setErr('비밀번호는 8자 이상으로 입력해 주세요.'); return; }
    if (pw !== pw2) { setErr('비밀번호 두 칸이 서로 달라요.'); return; }
    const r = await signUp.password({ phoneNumber: e164, password: pw, firstName: name.trim(), unsafeMetadata: { carrier } });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    const s = await signUp.verifications.sendPhoneCode();
    if (s.error) { setErr(clerkErrorMessage(s.error)); return; }
    setStep('verify'); setInfo(IS_PREVIEW ? '미리보기에서는 문자를 보내지 않아요. 아무 숫자 6자리를 입력하면 됩니다.' : `${phone} 번호로 인증번호를 보냈어요.`);
  });
  const verifySignUp = () => guard(async () => {
    const r = await signUp.verifications.verifyPhoneCode({ code: code.trim() });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signUp.status === 'complete') await signUp.finalize({ navigate: () => setPendingCompletion(true) });
    else setErr('가입을 완료하지 못했습니다. 인증번호를 다시 확인해 주세요.');
  });
  const resend = () => guard(async () => {
    if (step === 'verify') { const s = await signUp.verifications.sendPhoneCode(); if (s.error) { setErr(clerkErrorMessage(s.error)); return; } }
    else { const s = await signIn.mfa.sendPhoneCode(); if (s.error) { setErr(clerkErrorMessage(s.error)); return; } }
    setInfo('새 인증번호를 보냈어요.');
  });

  if (isSignedIn) {
    return (
      <Page back title="이미 로그인되어 있습니다">
        {err ? <Notice tone="error">{err}</Notice> : null}
        <Btn label="계속하기" loading={pendingCompletion} onPress={() => setPendingCompletion(true)} testID="auth-continue" />
      </Page>
    );
  }
  const fetching = busy || siStatus === 'fetching' || suStatus === 'fetching';

  if (step !== 'form') {
    return (
      <Page back title="휴대폰 인증" subtitle="문자로 받은 인증번호를 입력해 주세요.">
        {info ? <Notice tone="ok">{info}</Notice> : null}
        <Field testID="code-input" label="인증번호" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
        {err ? <Notice tone="error">{err}</Notice> : null}
        <Btn testID="verify-submit" label="인증하고 계속" icon="check" loading={fetching} disabled={code.trim().length < 4} onPress={step === 'verify' ? verifySignUp : verifySignIn} />
        <Btn kind="secondary" label="인증번호 다시 받기" onPress={resend} disabled={fetching} />
        <Btn kind="ghost" label="처음으로" onPress={() => { setStep('form'); setCode(''); setErr(null); }} />
      </Page>
    );
  }

  return (
    <Page back title={mode === 'signin' ? '로그인' : '가입하기'} subtitle={mode === 'signin' ? '휴대폰 번호와 비밀번호를 입력하세요.' : '휴대폰 인증으로 가입해요. 문자로 인증번호를 보내드려요.'}>
      {reauth ? <Notice tone="warn" title="본인 확인을 위해 다시 로그인해 주세요">최근 10분 안에 로그인한 기록이 있어야 회원 탈퇴를 진행할 수 있어요.</Notice> : null}
      <Pressable testID="auth-kakao" accessibilityRole="button" accessibilityLabel="카카오로 3초 만에 시작하기" disabled={fetching} onPress={doKakao}
        style={({ pressed }) => ({ minHeight: 58, borderRadius: 12, backgroundColor: '#FEE500', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: fetching ? 0.5 : pressed ? 0.85 : 1 })}>
        <Feather name="message-circle" size={22} color="#191919" />
        <T v="h3" color="#191919">카카오로 3초 만에 시작하기</T>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        <T v="small" color={c.mutedForeground}>또는 휴대폰 번호로</T>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>
      <Card>
        {mode === 'signup' ? <Field testID="name-input" label="이름" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="홍길동" /> : null}
        <Field testID="phone-input" label="휴대폰 번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="010-1234-5678" error={phone.length >= 10 && !phoneOk ? '휴대폰 번호를 다시 확인해 주세요.' : undefined} />
        {mode === 'signup' ? (
          <View style={{ gap: 6 }}>
            <T v="label">통신사</T>
            <Wrap>{CARRIERS.map((k) => <Chip key={k} label={k} selected={carrier === k} onPress={() => setCarrier(k)} testID={`carrier-${k}`} />)}</Wrap>
          </View>
        ) : null}
        <Field testID="password-input" label="비밀번호" hint={mode === 'signup' ? '8자 이상이면 돼요.' : undefined} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} error={mode === 'signup' && pw.length > 0 && !pwOk ? `8자 이상으로 입력해 주세요. (지금 ${pw.length}자)` : undefined} />
        {mode === 'signup' ? <Field testID="password2-input" label="비밀번호 확인" value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" /> : null}
        {mode === 'signup' ? <>
          <Toggle testID="consent-account" label="계정 정보 수집·이용에 동의합니다" desc="계정 생성과 본인 확인을 위해 이름, 휴대폰 번호, 통신사와 인증 기록을 처리해요. 탈퇴하면 삭제 처리합니다." value={accountConsent} onChange={setAccountConsent} />
          <Toggle testID="consent-terms" label="이용약관을 확인하고 동의합니다" value={termsConsent} onChange={setTermsConsent} />
        </> : null}
        {err ? <Notice tone="error">{err}</Notice> : null}
        <Btn testID="auth-submit" label={mode === 'signin' ? '로그인' : '인증번호 받기'} loading={fetching} disabled={!phoneOk || pw.length < 1 || (mode === 'signup' && (!name.trim() || !carrier || !pwOk || pw2.length < 1 || !accountConsent || !termsConsent))} onPress={mode === 'signin' ? doSignIn : doSignUp} />
      </Card>
      {mode === 'signup' ? <T v="small" color={c.mutedForeground}>계정 동의와 내 조건 입력·알림 선택은 따로 받아요.</T> : null}
      <Btn kind="secondary" label={mode === 'signin' ? '처음이세요? 가입하기' : '이미 계정이 있어요. 로그인'} onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); }} testID="auth-toggle-mode" />
      <Btn kind="ghost" label="개인정보처리방침 읽기" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} />
      <Btn kind="ghost" label="이용약관 읽기" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} />
      <Disclaimer />
    </Page>
  );
}
