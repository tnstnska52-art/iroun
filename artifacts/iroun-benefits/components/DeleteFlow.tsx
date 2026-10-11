import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { requestDeletion } from '@workspace/api-client-react';
import { signedInRecently, clearDraft, clearSignInMark } from '@/lib/draft';
import { useSignOutFlow } from '@/lib/session';
import { apiErrorMessage } from '@/lib/text';
import { errStatus } from '@/lib/util';
import { Btn, Card, Field, Notice, T } from './ui';

export function DeleteFlow({returnPath='/delete-account'}:{returnPath?:'/delete-account'|'/delete-request'}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { isSignedIn, signOut } = useAuth();
  const signOutFlow = useSignOutFlow();
  const [fresh, setFresh] = useState<boolean | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needReauth, setNeedReauth] = useState(false);

  useEffect(() => { signedInRecently().then(setFresh); }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <Card>
        <T v="h3">로그인이 필요합니다</T>
        <T>본인 확인을 위해 로그인한 뒤 탈퇴를 진행합니다.</T>
        <Btn label="로그인" onPress={() => router.push({ pathname: '/auth', params: { next: returnPath, reauth: '1' } })} testID="delete-login" />
      </Card>
    );
  }
  const reauth = async () => {
    await clearSignInMark();
    qc.clear();
    try {
      if (Platform.OS === 'web') {
        // Clerk performs a document redirect after web sign-out. Supplying the
        // destination prevents its default "/" redirect losing the reauth flow.
        await signOut({redirectUrl:`/auth?next=${encodeURIComponent(returnPath)}&reauth=1`});
      } else {
        await signOut();
        router.replace({ pathname: '/auth', params: { next: returnPath, reauth: '1' } });
      }
    } catch (e) { setErr(apiErrorMessage(e)); }
  };
  const ok = confirmation.trim() === '회원 탈퇴';
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await requestDeletion({ confirmation: confirmation.trim() });
      await clearDraft(); await clearSignInMark();
      qc.clear();
      await signOutFlow('/');
    } catch (e) {
      const s = errStatus(e);
      if (s === 401 || s === 403 || s === 409 || s === 412 || s === 428) { setNeedReauth(true); setErr('최근 10분 안에 로그인한 기록이 확인되지 않았습니다. 로그아웃 후 다시 로그인하면 이어서 탈퇴할 수 있습니다.'); }
      else setErr(apiErrorMessage(e));
    }
    setBusy(false);
  };

  return (
    <>
      <Notice tone="warn" title="탈퇴 전에 확인하세요">탈퇴하면 계정과 입력한 정보, 저장·진행 기록이 삭제 처리되며 되돌릴 수 없습니다. 스토어 구독은 자동으로 해지되지 않으므로 먼저 스토어에서 해지해 주세요.</Notice>
      {fresh === false || needReauth ? (
        <Card>
          <T v="h3">본인 확인이 필요합니다</T>
          <T>보안을 위해 최근 10분 안에 로그인한 상태에서만 탈퇴할 수 있습니다. 한 번 로그아웃하고 다시 로그인하면 이 화면으로 돌아옵니다.</T>
          {err ? <Notice tone="error">{err}</Notice> : null}
          <Btn label="로그아웃하고 다시 로그인" icon="log-in" onPress={reauth} testID="delete-reauth" />
          {fresh === false && !needReauth ? <Btn kind="ghost" label="이미 방금 로그인했어요. 계속하기" onPress={() => setFresh(true)} /> : null}
        </Card>
      ) : (
        <Card>
          <Field testID="delete-confirm-input" label="확인 문구 입력" hint="아래 칸에 '회원 탈퇴'를 그대로 입력해 주세요." value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" />
          {err ? <Notice tone="error">{err}</Notice> : null}
          <Btn kind="danger" label="회원 탈퇴하기" icon="user-x" disabled={!ok} loading={busy} onPress={submit} testID="delete-submit" />
        </Card>
      )}
    </>
  );
}
