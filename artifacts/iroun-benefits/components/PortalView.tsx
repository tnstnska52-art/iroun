import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Btn, Card, Notice, T } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { APP_RELEASE_VERSION, CUSTOMER_PORTAL_URL, DOWNLOAD_BRIDGE_JS, appBackJs, appInfoJs, appResumeJs, canOpenExternalUrl, openPortalExternalUrl, safeFileName, staysInApp } from '@/lib/customer-portal';
import { createPortalBackController } from '@/lib/portal-back';

/**
 * 회사 고객 창구(전산의 계약 고객 화면)를 앱 화면 안에서 그대로 연다.
 * 화면과 기능은 전산이 원본이라, 전산을 고치면 앱 빌드 없이 같이 바뀐다.
 * 로그인은 창구의 '로그인 유지' 쿠키를 그대로 쓰고, 앱은 아이디·비밀번호·세션을 다루지 않는다.
 *
 * - active: 이 화면이 보이고 있을 때만 안드로이드 뒤로가기를 가로챈다.
 * - openUrl: 알림을 눌렀을 때처럼 창구 안의 특정 주소로 옮길 때(회사 창구 주소만 허용).
 * - pushToken: 이 휴대폰의 알림 주소. 창구가 로그인한 계정에 연결할 수 있게 넘겨준다.
 */
export function PortalView({ active = true, openUrl, pushToken }: { active?: boolean; openUrl?: string | null; pushToken?: string | null }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const canBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const [note, setNote] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [start] = useState(() => (openUrl && staysInApp(openUrl) ? openUrl : CUSTOMER_PORTAL_URL));
  const loaded = useRef(false);
  const pendingUrl = useRef<string | null>(null);
  const pendingResume = useRef(false);
  const latestToken = useRef(pushToken);
  latestToken.current = pushToken;
  const externalFlight = useRef({ url: '', at: 0, pending: false });
  const back = useRef<ReturnType<typeof createPortalBackController> | null>(null);
  if (!back.current) back.current = createPortalBackController({
    send: (requestId, deadline) => {
      if (!ref.current) throw new Error('Portal not ready');
      ref.current.injectJavaScript(appBackJs(requestId, deadline));
    },
    fallback: () => { if (canBack.current) ref.current?.goBack(); else BackHandler.exitApp(); },
    onTimeout: () => setNote({ tone: 'info', text: '화면의 응답이 늦어요.\n뒤로가기를 다시 눌러 주세요.' }),
  });

  // 웹의 팝업·입력 단계를 먼저 닫는다. 웹이 처리하지 않았을 때만 브라우저 이력/OS로 넘긴다.
  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!loaded.current || failed) {
        if (canBack.current) { ref.current?.goBack(); return true; }
        return false;
      }
      back.current?.request();
      return true;
    });
    return () => { back.current?.cancel(); sub.remove(); };
  }, [active, failed]);

  // 알림을 눌러 들어오면 그 화면으로 옮긴다. 첫 화면이 아직 열리는 중이면 다 열린 뒤에 옮긴다.
  const go = (url: string) => ref.current?.injectJavaScript(`location.assign(${JSON.stringify(url)}); true;`);
  useEffect(() => {
    if (!openUrl || !staysInApp(openUrl) || !openUrl.startsWith('https://')) return;
    if (loaded.current) go(openUrl); else pendingUrl.current = openUrl;
  }, [openUrl]);

  // 알림 주소가 생기면 창구에 알려 준다(창구는 로그인된 계정에 연결해 둔다).
  useEffect(() => {
    if (pushToken) ref.current?.injectJavaScript(appInfoJs(Platform.OS, pushToken));
  }, [pushToken]);

  // 간편인증·파일 선택 뒤에는 WebView를 다시 만들지 않는다. 웹이 필요한 상태만 재확인한다.
  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', state => {
      const resumed = state === 'active' && (previous === 'background' || previous === 'inactive');
      previous = state;
      if (!resumed || !active) return;
      if (loaded.current) ref.current?.injectJavaScript(appResumeJs(Platform.OS, latestToken.current ?? null));
      else pendingResume.current = true;
    });
    return () => sub.remove();
  }, [active]);

  useEffect(() => () => back.current?.cancel(), []);

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const onNav = (s: WebViewNavigation) => { canBack.current = s.canGoBack; };

  const openExternal = async (url: string) => {
    if (!canOpenExternalUrl(url)) { setNote({ tone: 'error', text: '열 수 없는 주소예요' }); return; }
    const previous = externalFlight.current;
    if (previous.url === url && (previous.pending || Date.now() - previous.at < 700)) return;
    const attempt = { url, at: Date.now(), pending: true };
    externalFlight.current = attempt;
    try { await openPortalExternalUrl(url, target => Linking.openURL(target)); }
    catch { setNote({ tone: 'error', text: '연결할 앱이나 브라우저를 열지 못했어요.\n설치 상태를 확인하고 다시 눌러 주세요.' }); }
    finally { attempt.pending = false; }
  };

  // 회사 창구 밖의 주소(기관 사이트, 전화, 카카오 등)는 휴대폰 브라우저·앱으로 넘긴다.
  const onRequest = (req: { url: string }) => {
    if (staysInApp(req.url)) return true;
    void openExternal(req.url);
    return false;
  };

  const openWindow = (url: string) => {
    if (url === 'about:blank' || !url) return;
    if (url.startsWith('https://') && staysInApp(url)) go(url);
    else void openExternal(url);
  };

  const onMessage = async (e: WebViewMessageEvent) => {
    let m: { type?: string; name?: string; data?: string; mime?: string; requestId?: string; handled?: boolean };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'app-back-result') {
      if (e.nativeEvent.url.startsWith('https://') && staysInApp(e.nativeEvent.url)) back.current?.receive(m);
      return;
    }
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
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 24, paddingHorizontal: 16 }} testID="portal-failed">
        <Card style={{ gap: 10 }}>
          <T v="h3">{'화면을\n열지 못했어요'}</T>
          <T color={c.mutedForeground}>{'인터넷 연결을 확인하고\n다시 열어 주세요'}</T>
          <Btn label="다시 열기" icon="refresh-cw" onPress={() => { back.current?.cancel(); loaded.current = false; setFailed(false); setLoading(true); setKey((k) => k + 1); }} testID="portal-retry" />
          <Btn kind="secondary" label="브라우저로 열기" onPress={() => { Linking.openURL(CUSTOMER_PORTAL_URL).catch(() => undefined); }} testID="portal-external" />
        </Card>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top }} testID="portal-screen">
      <WebView
        key={key}
        ref={ref}
        source={{ uri: start }}
        // 모든 주소를 onRequest에서 검사해야 인증 앱 주소도 중복 없이 한곳에서 처리된다.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={onRequest}
        onOpenWindow={(event) => openWindow(event.nativeEvent.targetUrl)}
        onNavigationStateChange={onNav}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={DOWNLOAD_BRIDGE_JS + appInfoJs(Platform.OS, pushToken ?? null)}
        injectedJavaScript={DOWNLOAD_BRIDGE_JS + appInfoJs(Platform.OS, pushToken ?? null)}
        onLoadStart={() => { loaded.current = false; back.current?.cancel(); }}
        onLoadEnd={() => {
          setLoading(false);
          loaded.current = true;
          const u = pendingUrl.current; pendingUrl.current = null;
          if (u && u !== start) go(u);
          else if (pendingResume.current) {
            pendingResume.current = false;
            ref.current?.injectJavaScript(appResumeJs(Platform.OS, latestToken.current ?? null));
          }
        }}
        onError={() => { loaded.current = false; back.current?.cancel(); setFailed(true); }}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        onContentProcessDidTerminate={() => { loaded.current = false; back.current?.cancel(); ref.current?.reload(); }}
        onRenderProcessGone={() => { loaded.current = false; back.current?.cancel(); setLoading(true); setKey((k) => k + 1); return true; }}
        // 로그인 유지 쿠키를 앱을 껐다 켜도 남긴다.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        cacheEnabled
        incognito={false}
        // 사진·PDF 서류 올리기(카메라·사진첩·파일)는 창구의 파일 선택을 그대로 쓴다.
        allowFileAccess={false}
        allowsInlineMediaPlayback
        // 화면 동작
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows
        textZoom={100}
        // 아이폰 전용 설정. 안드로이드에 글자("normal")로 넘기면 앱이 바로 꺼진다(ClassCastException).
        decelerationRate={Platform.OS === 'ios' ? 'normal' : undefined}
        bounces={false}
        overScrollMode="never"
        applicationNameForUserAgent={'IrounApp/' + APP_RELEASE_VERSION}
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      />
      {loading ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 80, left: 0, right: 0, alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : null}
      {note ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}>
          <Notice tone={note.tone}>{note.text}</Notice>
        </View>
      ) : null}
    </View>
  );
}
