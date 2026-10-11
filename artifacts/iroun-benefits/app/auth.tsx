import React, { useEffect, useState } from 'react';
import { useAuth, useSignIn, useSignUp } from '@clerk/expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Btn, Card, Disclaimer, Field, Notice, Page, T, Toggle } from '@/components/ui';
import { getMe, savePreferences } from '@workspace/api-client-react';
import { clerkErrorMessage } from '@/lib/text';
import { markSignIn } from '@/lib/draft';
import { useColors } from '@/hooks/useColors';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const c = useColors();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; next?: string; reauth?: string }>();
  const { signIn, fetchStatus: siStatus } = useSignIn();
  const { signUp, fetchStatus: suStatus } = useSignUp();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
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
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const doSignIn = () => guard(async () => {
    const r = await signIn.password({ emailAddress: email.trim(), password: pw });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: () => setPendingCompletion(true) });
    } else if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
      const f = signIn.supportedSecondFactors?.find((x) => x.strategy === 'email_code');
      if (f) { await signIn.mfa.sendEmailCode(); setStep('verify2'); setInfo('이메일로 추가 인증번호를 보냈습니다.'); }
      else setErr('이 계정은 추가 인증이 필요하지만 앱에서 지원하지 않는 방식입니다.');
    } else setErr('로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
  });
  const verifySignIn = () => guard(async () => {
    const r = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signIn.status === 'complete') await signIn.finalize({ navigate: () => setPendingCompletion(true) });
  });
  const doSignUp = () => guard(async () => {
    if (!accountConsent || !termsConsent) { setErr('계정 정보 수집 동의와 이용약관 확인이 필요합니다.'); return; }
    if (pw !== pw2) { setErr('비밀번호 두 칸이 서로 다릅니다.'); return; }
    const r = await signUp.password({ emailAddress: email.trim(), password: pw });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    const s = await signUp.verifications.sendEmailCode();
    if (s.error) { setErr(clerkErrorMessage(s.error)); return; }
    setStep('verify'); setInfo('입력하신 이메일로 인증번호를 보냈습니다.');
  });
  const verifySignUp = () => guard(async () => {
    const r = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (r.error) { setErr(clerkErrorMessage(r.error)); return; }
    if (signUp.status === 'complete') await signUp.finalize({ navigate: () => setPendingCompletion(true) });
    else setErr('가입을 완료하지 못했습니다. 인증번호를 다시 확인해 주세요.');
  });
  const resend = () => guard(async () => {
    if (step === 'verify') { const s = await signUp.verifications.sendEmailCode(); if (s.error) { setErr(clerkErrorMessage(s.error)); return; } }
    else { const s = await signIn.mfa.sendEmailCode(); if (s.error) { setErr(clerkErrorMessage(s.error)); return; } }
    setInfo('새 인증번호를 보냈습니다.');
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
      <Page back title="이메일 인증" subtitle="메일로 받은 인증번호를 입력해 주세요.">
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
    <Page back title={mode === 'signin' ? '로그인' : '가입하기'} subtitle={mode === 'signin' ? '이메일과 비밀번호를 입력하세요.' : '이메일로 계정을 만듭니다. 인증번호 확인이 필요합니다.'}>
      {reauth ? <Notice tone="warn" title="본인 확인을 위해 다시 로그인해 주세요">보안을 위해 최근 10분 안에 로그인한 기록이 있어야 회원 탈퇴를 진행할 수 있습니다. 로그인하면 탈퇴 화면으로 돌아갑니다.</Notice> : null}
      <Card>
        <Field testID="email-input" label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="name@example.com" />
        <Field testID="password-input" label="비밀번호" hint={mode === 'signup' ? '8자 이상, 문자와 숫자를 섞어 주세요.' : undefined} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} textContentType={mode === 'signup' ? 'newPassword' : 'password'} />
        {mode === 'signup' ? <Field testID="password2-input" label="비밀번호 확인" value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" /> : null}
        {mode === 'signup' ? <>
          <Toggle label="계정 정보 수집·이용에 동의합니다" desc="계정 생성과 본인 확인을 위해 이메일과 인증 기록을 처리합니다. 회원 유지 중 보관하며 탈퇴 시 삭제 처리합니다. 입력 조건 정보와 알림 동의는 별도로 선택합니다. 최종 처리방침은 출시 전 확정이 필요합니다." value={accountConsent} onChange={setAccountConsent} />
          <Toggle label="이용약관을 확인하고 동의합니다" value={termsConsent} onChange={setTermsConsent} />
        </> : null}
        {err ? <Notice tone="error">{err}</Notice> : null}
        <Btn testID="auth-submit" label={mode === 'signin' ? '로그인' : '인증번호 받고 가입'} icon={mode === 'signin' ? 'log-in' : 'mail'} loading={fetching} disabled={!emailOk || pw.length < 1 || (mode === 'signup' && (pw2.length < 1 || !accountConsent || !termsConsent))} onPress={mode === 'signin' ? doSignIn : doSignUp} />
      </Card>
      {mode === 'signup' ? <T v="small" color={c.mutedForeground}>계정 생성에 필요한 동의와 내 조건 입력·알림 선택은 별개입니다. 아래 문서를 먼저 확인해 주세요.</T> : null}
      <Btn kind="secondary" label={mode === 'signin' ? '처음이세요? 가입하기' : '이미 계정이 있어요. 로그인'} onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); }} testID="auth-toggle-mode" />
      <Btn kind="ghost" label="개인정보처리방침 읽기" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} />
      <Btn kind="ghost" label="이용약관 읽기" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} />
      <Disclaimer />
    </Page>
  );
}
