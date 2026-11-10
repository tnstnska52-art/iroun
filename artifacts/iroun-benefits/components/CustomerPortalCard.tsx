import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Btn, Card, Notice, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { createCustomerPortalLauncher } from '@/lib/customer-portal';

/** Accessible before Clerk sign-in: company-issued credentials belong to the CRM. */
export function CustomerPortalCard() {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const launcher = useRef<ReturnType<typeof createCustomerPortalLauncher> | null>(null);
  if (!launcher.current) launcher.current = createCustomerPortalLauncher({
    platform: Platform.OS,
    openInApp: url => WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'close',
      showTitle: true,
      enableBarCollapsing: false,
    }),
    openExternal: url => Linking.openURL(url),
    openWeb: url => window.location.assign(url),
  });
  const open = async (external = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setFailed(false);
    try { await launcher.current!(external); }
    catch { if (mounted.current) setFailed(true); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  return <Card tone="soft">
    <T v="label" color={c.primary}>계약 고객 서비스</T>
    <T v="h3">신청 · 서류 · 회사와 대화</T>
    <T v="small" color={c.mutedForeground}>회사에서 받은 아이디로 이용해요.</T>
    <Btn label={failed ? '다시 열기' : '내 신청·대화 열기'} icon="message-circle" loading={busy} onPress={() => void open()} testID="customer-portal-open" />
    {failed ? <>
      <Notice tone="error">고객 화면을 열지 못했어요. 다시 시도해 주세요.</Notice>
      {Platform.OS !== 'web' ? <Btn kind="secondary" label="기본 브라우저로 열기" loading={busy} onPress={() => void open(true)} testID="customer-portal-browser" /> : null}
    </> : null}
  </Card>;
}
