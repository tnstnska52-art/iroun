import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@clerk/expo';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { watchNotificationOpen } from './native-notifications';
import {
  getGetMeQueryKey,
  setAuthTokenGetter,
  useGetMe,
  getGetRecommendationsQueryKey,
  getListTrackingQueryKey,
  getGetMembershipQueryKey,
  getGetAdminDashboardQueryKey,
} from '@workspace/api-client-react';
import { clearDraft, clearSignInMark } from './draft';
import { useSettings } from './settings';

export const PERSONAL_KEYS = () => [
  getGetMeQueryKey(), getGetRecommendationsQueryKey(), getListTrackingQueryKey(),
  getGetMembershipQueryKey(), getGetAdminDashboardQueryKey(),
];

/** Mounted once inside ClerkLoaded. Wires token getter, focus refetch, cache wipes. */
export function AuthBridge({onMounted}:{onMounted?:()=>void}={}) {
  useEffect(()=>{onMounted?.();},[onMounted]);
  const { getToken, userId, isLoaded } = useAuth();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  const router=useRouter();
  useEffect(()=>{
    if(!isLoaded||!userId)return;
    return watchNotificationOpen(id=>router.push({pathname:'/benefit/[id]',params:{id}}));
  },[isLoaded,userId,router]);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = async (...args) => isLoaded ? getToken(...args) : null;

  useEffect(() => {
    setAuthTokenGetter(async () => {
      let timer:ReturnType<typeof setTimeout>|undefined;
      try { return (await Promise.race([getTokenRef.current(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),20000);})])) ?? null; } catch { return null; }
      finally{if(timer)clearTimeout(timer);}
    });
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const cur = userId ?? null;
    const before = prev.current;
    if (before !== undefined && before !== cur) {
      qc.clear();
      // 처음 로그인(게스트 -> 계정)할 때만 입력 초안을 보존한다. 로그아웃/계정 전환은 모두 지운다.
      if (before !== null) clearDraft();
      if (!cur) clearSignInMark();
    }
    prev.current = cur;
  }, [userId, isLoaded, qc]);
  const acc = useAccount();
  const { setLargeText } = useSettings();
  const syncedFor = useRef<string | null>(null);
  const wasActive = useRef(false);
  useEffect(() => {
    // 계정에 저장된 큰 글씨 설정을 복원한다(재설치 후 포함).
    if (acc.me && syncedFor.current !== acc.me.id) {
      syncedFor.current = acc.me.id;
      setLargeText(acc.me.preferences.largeText);
    }
    if (!acc.isSignedIn) syncedFor.current = null;
  }, [acc.me, acc.isSignedIn, setLargeText]);
  useEffect(() => {
    // 이용권이 만료/회수되면 추천 캐시를 즉시 비운다.
    if (wasActive.current && !acc.active) {
      qc.removeQueries({ queryKey: getGetRecommendationsQueryKey() });
      qc.removeQueries({predicate:q=>String(q.queryKey[0]).startsWith("/api/service/")});
    }
    wasActive.current = acc.active;
  }, [acc.active, qc]);
  return null;
}

export function useAccount() {
  const { isLoaded, isSignedIn,userId } = useAuth();
  const q = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn, refetchInterval: 5000, retry:false } });
  const me = isLoaded && isSignedIn && q.data?.id===userId ? q.data : undefined;
  const [, tick] = useState(0);
  // Network requests can hang rather than fail. Old positive authority must not
  // keep a private screen visible indefinitely while the server is unreachable.
  const age=Date.now()-q.dataUpdatedAt;
  const authorityFresh=q.dataUpdatedAt>0 && age>=0 && age<15000;
  useEffect(()=>{
    if(!isSignedIn||!q.dataUpdatedAt)return;
    const timer=setTimeout(()=>tick(n=>n+1),Math.max(50,15000-(Date.now()-q.dataUpdatedAt)));
    return()=>clearTimeout(timer);
  },[isSignedIn,q.dataUpdatedAt]);
  const ent = me?.entitlement;
  // 이용권 만료 시각에 맞춰 다시 계산하고 서버 상태를 다시 확인한다.
  const ends = ent?.active
    ? [ent.subscriptionActive ? ent.subscriptionUntil : undefined, ent.grantActive ? ent.grantUntil : undefined,
       ent.trialActive?ent.trialUntil:undefined,ent.contractActive?ent.contractUntil:undefined]
    : [];
  const activeEnds = ends.filter((x): x is string => !!x).map((x) => new Date(x).getTime()).filter((x) => !isNaN(x));
  const noEnd = ent?.active && ((ent.subscriptionActive && !ent.subscriptionUntil) || (ent.grantActive && !ent.grantUntil));
  const expiryAt = !noEnd && activeEnds.length ? Math.max(...activeEnds) : null;
  const refetchMe = q.refetch;
  useEffect(() => {
    if (!expiryAt) return;
    const ms = Math.min(Math.max(expiryAt - Date.now() + 500, 0), 2147483000);
    const t = setTimeout(() => { tick((n) => n + 1); refetchMe(); }, ms);
    return () => clearTimeout(t);
  }, [expiryAt, refetchMe]);
  const expired = expiryAt !== null && Date.now() > expiryAt;
  return {
    isLoaded,
    isSignedIn: !!isSignedIn,
    me,
    loading: !isLoaded || (!!isSignedIn && (q.isLoading||(!q.error&&!me))),
    error: q.error,
    refetch: q.refetch,
    active: !!isSignedIn && isLoaded && authorityFresh && !q.error && !!me?.entitlement.active && !expired,
    isAdminRole: authorityFresh && !q.error && me?.role === 'admin',
    isStaffRole:authorityFresh&&!q.error&&me?.role==='staff',
    authorityFresh,
  };
}

export function useSignOutFlow() {
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(async (dest: string = '/') => {
    await clearDraft();
    await clearSignInMark();
    await signOut(Platform.OS === 'web' ? {redirectUrl:dest} : undefined);
    qc.clear();
    if (Platform.OS !== 'web') router.replace(dest as never);
  }, [signOut, qc, router]);
}
