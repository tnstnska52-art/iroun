import React, { useEffect,useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import { loadMonthlyPackage,nativePurchase,nativeRestore } from '@/lib/native-billing';
import { syncMembership } from '@workspace/api-client-react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, getGetMembershipQueryKey, restorePurchases, useGetMembership } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAccount } from '@/lib/session';
import { Badge, Btn, Card, Disclaimer, ErrorState, Loading, Notice, Page, Section, T } from '@/components/ui';
import { apiErrorMessage } from '@/lib/text';
import { errStatus, fmtDate } from '@/lib/util';

export default function Membership() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const acc = useAccount();
  const m = useGetMembership({ query: { queryKey: getGetMembershipQueryKey(), enabled: acc.isSignedIn } });
  const [busy, setBusy] = useState(false);
  const [monthly,setMonthly]=useState<PurchasesPackage|null>(null);
  const [storeError,setStoreError]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;setMonthly(null);
    if(m.data?.configured&&acc.me?.id) void loadMonthlyPackage(m.data,acc.me.id)
      .then(p=>{if(live){setMonthly(p);setStoreError(null);}})
      .catch(e=>{if(live)setStoreError(e instanceof Error&&/[가-힣]/.test(e.message)?e.message:'스토어에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');});
    return ()=>{live=false;};
  },[m.data,acc.me?.id]);
  const purchase=async()=>{
    if(!m.data||!monthly||!acc.me)return;
    setBusy(true);setMsg(null);
    try{
      await nativePurchase(m.data,acc.me.id,monthly);
      await syncMembership();
      await acc.refetch();
      setMsg({t:'ok',s:'기관 확인 결과를 반영했습니다. 이용 상태를 확인해 주세요.'});
    }catch(e){setMsg({t:'error',s:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:apiErrorMessage(e)});}
    finally{setBusy(false);}
  };
  const [msg, setMsg] = useState<{ t: 'ok' | 'warn' | 'error'; s: string } | null>(null);

  const restore = async () => {
    setBusy(true); setMsg(null);
    try {
      if(m.data?.configured&&acc.me) await nativeRestore(m.data,acc.me.id);
      const r = await restorePurchases();
      await qc.invalidateQueries({ queryKey: getGetMembershipQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setMsg({ t: 'ok', s: r.message });
    } catch (e) {
      if (errStatus(e) === 503) setMsg({ t: 'warn', s: '구독이 아직 준비 중이라 복원할 수 없어요.' });
      else setMsg({ t: 'error', s: apiErrorMessage(e) });
    }
    setBusy(false);
  };
  const ent = m.data?.entitlement ?? acc.me?.entitlement;

  return (
    <Page back title={ent?.active ? '이용 중이에요' : '계속 이용하기'}>
      <Card>
        <T v="h3">{ent?.active ? '지금 모두 볼 수 있어요' : '구독하면 다시 볼 수 있어요'}</T>
        <T>• 지원금 전체 목록과 금액</T>
        <T>• 놓친 지원금</T>
        <T>• 신청 순서와 새 공고 알림</T>
      </Card>

      {ent?.active ? null : (
        <Section title="구독">
          {acc.isSignedIn && m.isLoading ? <Loading rows={1} /> : acc.isSignedIn && m.error ? <ErrorState message={apiErrorMessage(m.error)} onRetry={() => m.refetch()} /> : monthly ? (
            <Card>
              <T v="title">월 {monthly.product.priceString}</T>
              <T v="small" color={c.mutedForeground}>언제든 스토어에서 해지할 수 있어요</T>
              <Btn label="구독 시작" disabled={busy} loading={busy} onPress={purchase} testID="purchase" />
            </Card>
          ) : (
            <Card>
              <T v="h3">구독은 준비 중이에요</T>
              <T v="small" color={c.mutedForeground}>먼저 쓰고 싶으면 문의를 남겨 주세요</T>
              {storeError ? <T v="small" color={c.warning}>{storeError}</T> : null}
              <Btn label="문의 남기기" icon="message-circle" onPress={() => router.push('/consult' as never)} testID="membership-ask" />
            </Card>
          )}
        </Section>
      )}

      <Section title="내 이용 상태">
        {!acc.isSignedIn ? (
          <Card><T>로그인하면 이용 상태를 확인할 수 있습니다.</T><Btn label="로그인 또는 가입" onPress={() => router.push({ pathname: '/auth', params: { next: '/membership' } })} testID="membership-login" /></Card>
        ) : ent ? (
          <Card>
            <Badge label={ent.active ? '이용 가능' : '이용권 없음'} tone={ent.active ? 'ok' : 'muted'} />
            <T>구독: {ent.subscriptionActive ? `이용 중${ent.subscriptionUntil ? ` (${fmtDate(ent.subscriptionUntil)}까지)` : ''}` : '없음'}</T>
            <T>무료 이용: {ent.grantActive ? `사용 중${ent.grantUntil ? ` (${fmtDate(ent.grantUntil)}까지)` : ''}` : '없음'}</T>
                      </Card>
        ) : <Loading rows={1} />}
      </Section>

      {acc.isSignedIn ? (
        <Section title="구매 복원">
          <Card>
            <T>다른 휴대폰에서 구독했다면 눌러 주세요</T>
            <Btn label="구매 복원" icon="refresh-cw" kind="secondary" loading={busy} onPress={restore} testID="restore-purchases" />
            {msg ? <Notice tone={msg.t === 'warn' ? 'warn' : msg.t}>{msg.s}</Notice> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="구독 관리·해지">
        <Card>
          <T>해지는 스토어에서 해요</T>
          <Btn kind="secondary" icon="external-link" label="Apple 구독 관리 열기" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} testID="manage-apple" />
          <Btn kind="secondary" icon="external-link" label="Google Play 구독 관리 열기" onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')} testID="manage-google" />
        </Card>
      </Section>

      <Section title="꼭 알아두세요">
        <Card>
          <T>• 구독은 해지 전까지 자동 갱신돼요</T>
          <T>• 탈퇴해도 구독은 해지되지 않아요. 스토어에서 먼저 해지하세요</T>
          <Btn kind="ghost" label="개인정보처리방침" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} />
          <Btn kind="ghost" label="이용약관" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} />
        </Card>
      </Section>
      <Disclaimer />
    </Page>
  );
}
