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
      if (errStatus(e) === 503) setMsg({ t: 'warn', s: '스토어 결제 연동 설정이 아직 끝나지 않아 구매 복원을 할 수 없습니다. 복원에 성공한 것이 아닙니다. 설정이 끝나면 다시 시도해 주세요.' });
      else setMsg({ t: 'error', s: apiErrorMessage(e) });
    }
    setBusy(false);
  };
  const ent = m.data?.entitlement ?? acc.me?.entitlement;

  return (
    <Page back title="회원 이용권" subtitle="맞춤 확인과 알림 설정은 회원 이용권으로 제공됩니다.">
      <Card>
        <T v="h3">이용권으로 할 수 있는 일</T>
        <T>• 내 사업장·가구 정보와 지원 조건을 비교해 사유 보기</T>
        <T>• 맞춤 알림 수신 의사 저장</T>
        <T v="small" color={c.mutedForeground}>지원 공지 열람, 환급금 안내, 저장·서류 체크는 이용권 없이도 쓸 수 있습니다.</T>
      </Card>

      <Section title="요금">
        {acc.isSignedIn && m.isLoading ? <Loading rows={1} /> : acc.isSignedIn && m.error ? <ErrorState message={apiErrorMessage(m.error)} onRetry={() => m.refetch()} /> : (
          <Card>
            {m.data?.configured ? <Notice tone="ok" title="스토어 결제 연동됨">{m.data.message}</Notice> : <Notice tone="warn" title="결제 준비 중">{m.data?.message || '스토어 구독 연동이 아직 준비되지 않았습니다.'} 요금은 출시 전 확인 중이며, 현재는 구매할 수 없습니다.</Notice>}
            {monthly?<T v="h3">월 {monthly.product.priceString}</T>:null}
            {storeError?<Notice tone="warn">{storeError}</Notice>:null}
            <Btn label={monthly?'스토어에서 월구독 시작':'구독 시작 (미연결)'} disabled={!monthly||busy} loading={busy} onPress={purchase} icon="lock" testID="purchase-disabled" hint="실제 스토어 상품·가격이 확인되기 전에는 구매할 수 없습니다" />
          </Card>
        )}
      </Section>

      <Section title="내 이용 상태">
        {!acc.isSignedIn ? (
          <Card><T>로그인하면 이용 상태를 확인할 수 있습니다.</T><Btn label="로그인 또는 가입" onPress={() => router.push({ pathname: '/auth', params: { next: '/membership' } })} testID="membership-login" /></Card>
        ) : ent ? (
          <Card>
            <Badge label={ent.active ? '이용 가능' : '이용권 없음'} tone={ent.active ? 'ok' : 'muted'} />
            <T>스토어 구독: {ent.subscriptionActive ? `이용 중${ent.subscriptionUntil ? ` (${fmtDate(ent.subscriptionUntil)}까지)` : ''}` : '없음'}</T>
            <T>무상 이용권: {ent.grantActive ? `사용 중${ent.grantUntil ? ` (${fmtDate(ent.grantUntil)}까지)` : ''}` : '없음'}</T>
            <T v="small" color={c.mutedForeground}>무상 이용권은 운영자가 계정에 직접 부여하는 실제 무료 이용권입니다. 앱 밖에서 결제하는 상품이 아닙니다.</T>
          </Card>
        ) : <Loading rows={1} />}
      </Section>

      {acc.isSignedIn ? (
        <Section title="구매 복원">
          <Card>
            <T>다른 기기에서 구독하셨다면 복원을 눌러 확인합니다.</T>
            <Btn label="구매 복원" icon="refresh-cw" kind="secondary" loading={busy} onPress={restore} testID="restore-purchases" />
            {msg ? <Notice tone={msg.t === 'warn' ? 'warn' : msg.t}>{msg.s}</Notice> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="구독 관리·해지">
        <Card>
          <T>구독은 앱이 아니라 스토어에서 관리하고 해지합니다.</T>
          <Btn kind="secondary" icon="external-link" label="Apple 구독 관리 열기" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} testID="manage-apple" />
          <Btn kind="secondary" icon="external-link" label="Google Play 구독 관리 열기" onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')} testID="manage-google" />
        </Card>
      </Section>

      <Section title="꼭 알아두세요">
        <Card>
          <T>• 스토어 구독은 해지하지 않으면 기간이 끝날 때 같은 조건으로 자동 갱신됩니다. 갱신 전에 스토어에서 해지할 수 있습니다.</T>
          <T>• 앱에서 회원 탈퇴를 해도 스토어 구독은 자동으로 해지되지 않습니다. 탈퇴 전에 스토어에서 먼저 해지해 주세요.</T>
          <Btn kind="ghost" label="개인정보처리방침" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} />
          <Btn kind="ghost" label="이용약관" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} />
        </Card>
      </Section>
      <Disclaimer />
    </Page>
  );
}
