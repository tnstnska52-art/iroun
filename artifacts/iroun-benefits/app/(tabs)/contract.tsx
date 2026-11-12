import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Btn, Card, Notice, Page, T } from '@/components/ui';
import { CustomerPortalCard } from '@/components/CustomerPortalCard';
import { useColors } from '@/hooks/useColors';
import { CUSTOMER_PORTAL_URL, DOWNLOAD_BRIDGE_JS, safeFileName, staysInApp } from '@/lib/customer-portal';

/**
 * 내 계약 탭: 회사 고객 창구(전산의 계약 고객 화면)를 앱 화면 안에서 그대로 연다.
 * 화면과 기능은 전산 쪽이 원본이라, 전산을 고치면 앱 빌드 없이 같이 바뀐다.
 * 로그인은 고객 창구의 '로그인 유지'(쿠키)를 그대로 쓰고, 앱은 아이디·비밀번호·토큰을 다루지 않는다.
 */
export default function ContractTab() {
  if (Platform.OS === 'web') {
    // 웹 버전 앱에서는 같은 탭으로 고객 창구를 연다(기존 동작).
    return <Page tab title="내 계약"><CustomerPortalCard /></Page>;
  }
  return <PortalView />;
}

function PortalView() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const canBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const [note, setNote] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  // 안드로이드 뒤로가기: 창구 안에서 이전 화면이 있으면 그쪽으로, 없으면 앱 기본 동작.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack.current) { ref.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []));

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const onNav = (s: WebViewNavigation) => { canBack.current = s.canGoBack; };

  // 회사 창구 밖의 주소(기관 사이트, 전화, 카카오 등)는 휴대폰 브라우저·앱으로 넘긴다.
  const onRequest = (req: { url: string }) => {
    if (staysInApp(req.url)) return true;
    Linking.openURL(req.url).catch(() => setNote({ tone: 'error', text: '열 수 없는 주소예요' }));
    return false;
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    let m: { type?: string; name?: string; data?: string; mime?: string };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'download-error') { setNote({ tone: 'error', text: '서류를 받지 못했어요\n다시 눌러 주세요' }); return; }
    if (m.type !== 'download' || !m.data) return;
    try {
      const f = new File(Paths.cache, safeFileName(m.name ?? 'file'));
      if (f.exists) f.delete();
      f.write(m.data, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: m.mime || undefined, dialogTitle: '서류 저장·열기' });
      else setNote({ tone: 'info', text: '이 휴대폰은 파일 저장 창을\n열 수 없어요' });
    } catch {
      setNote({ tone: 'error', text: '서류를 저장하지 못했어요\n다시 눌러 주세요' });
    }
  };

  if (failed) {
    return (
      <Page tab title="내 계약">
        <Card style={{ gap: 10 }}>
          <T v="h3">{'고객 창구를\n열지 못했어요'}</T>
          <T color={c.mutedForeground}>{'인터넷 연결을 확인하고\n다시 열어 주세요'}</T>
          <Btn label="다시 열기" icon="refresh-cw" onPress={() => { setFailed(false); setLoading(true); setKey((k) => k + 1); }} testID="portal-retry" />
          <Btn kind="secondary" label="브라우저로 열기" onPress={() => { Linking.openURL(CUSTOMER_PORTAL_URL).catch(() => undefined); }} testID="portal-external" />
        </Card>
      </Page>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }} testID="portal-screen">
      <WebView
        key={key}
        ref={ref}
        source={{ uri: CUSTOMER_PORTAL_URL }}
        originWhitelist={['https://*', 'about:*', 'blob:*', 'data:*']}
        onShouldStartLoadWithRequest={onRequest}
        onNavigationStateChange={onNav}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={DOWNLOAD_BRIDGE_JS}
        injectedJavaScript={DOWNLOAD_BRIDGE_JS}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        onContentProcessDidTerminate={() => ref.current?.reload()}
        onRenderProcessGone={() => { setLoading(true); setKey((k) => k + 1); return true; }}
        // 로그인 유지 쿠키를 앱을 껐다 켜도 남긴다.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        cacheEnabled
        incognito={false}
        // 사진·PDF 서류 올리기(카메라·사진첩·파일)
        allowFileAccess={false}
        allowsInlineMediaPlayback
        // 화면 동작
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        textZoom={100}
        decelerationRate="normal"
        bounces={false}
        overScrollMode="never"
        applicationNameForUserAgent="IrounApp/1"
        style={{ flex: 1, backgroundColor: c.background }}
      />
      {loading ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 80, left: 0, right: 0, alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : null}
      {note ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Notice tone={note.tone}>{note.text}</Notice>
        </View>
      ) : null}
    </View>
  );
}
