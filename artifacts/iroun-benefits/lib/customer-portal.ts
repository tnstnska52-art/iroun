// Contract customers use the same CRM session and records on every surface.
// Never append app tokens, phone numbers, or customer IDs to this URL.
export const CUSTOMER_PORTAL_URL = 'https://go.irowoon.com/package-conditions';
export const APP_RELEASE_VERSION = '1.2.0';

export type PortalResult = 'opened' | 'closed' | 'busy';
type BrowserResult = { type: string };
type PortalNavigation = {
  platform: string;
  openInApp: (url: string) => Promise<BrowserResult>;
  openExternal: (url: string) => Promise<unknown>;
  openWeb: (url: string) => void;
};

/** Opening the portal never submits a request or marks a reply as read. */
export function createCustomerPortalLauncher(navigation: PortalNavigation) {
  let pending = false;
  return async (external = false): Promise<PortalResult> => {
    if (pending) return 'busy';
    pending = true;
    try {
      if (navigation.platform === 'web') {
        // Keep web navigation in this tab: no blocked popup or duplicate login window.
        navigation.openWeb(CUSTOMER_PORTAL_URL);
        return 'opened';
      }
      if (external) {
        await navigation.openExternal(CUSTOMER_PORTAL_URL);
        return 'opened';
      }
      const result = await navigation.openInApp(CUSTOMER_PORTAL_URL);
      if (result.type === 'cancel' || result.type === 'dismiss') return 'closed';
      if (result.type !== 'opened') throw new Error('Customer portal could not be opened');
      return 'opened';
    } finally {
      pending = false;
    }
  };
}

/** 앱 안에서 그대로 여는 주소: 회사 고객 창구(irowoon.com)와 앱 안에서 만든 임시 주소만. 나머지는 휴대폰 브라우저·앱으로 연다. */
export function staysInApp(url: string): boolean {
  if (/^(about:blank|blob:|data:)/i.test(url)) return true;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  return u.hostname === 'irowoon.com' || u.hostname.endsWith('.irowoon.com');
}

/**
 * 고객 창구는 서류를 blob 주소 + download 속성으로 내려받게 한다.
 * 앱 안 화면(WebView)은 이것을 저장하지 못하므로, 그 클릭을 가로채 파일 내용을 앱으로 넘긴다.
 * 앱은 받은 파일을 휴대폰 공유 창(저장·열기)으로 보여 준다.
 */
export const DOWNLOAD_BRIDGE_JS = `(function(){
  if (window.__irounBridge) return; window.__irounBridge = true;
  var send = function(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
  var orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    var href = this.href || '', name = this.getAttribute('download');
    if (name !== null && /^(blob:|data:)/.test(href)) {
      fetch(href).then(function(r){ return r.blob(); }).then(function(b){
        var fr = new FileReader();
        fr.onload = function(){ var s = String(fr.result); send({ type: 'download', name: name || 'file', mime: b.type || '', data: s.slice(s.indexOf(',') + 1) }); };
        fr.onerror = function(){ send({ type: 'download-error' }); };
        fr.readAsDataURL(b);
      }).catch(function(){ send({ type: 'download-error' }); });
      return;
    }
    return orig.apply(this, arguments);
  };
})(); true;`;

/** 저장할 파일 이름에서 경로·기호를 빼고 확장자는 남긴다. */
export function safeFileName(name: string): string {
  const n = (name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return n || 'file';
}

/** Expo 알림 주소 모양만 넘긴다(다른 값은 버린다). */
export function validPushToken(t: string | null | undefined): string | null {
  return typeof t === 'string' && /^ExponentPushToken\[[A-Za-z0-9_-]{10,}\]$/.test(t) ? t : null;
}

/**
 * 창구 화면에 '앱에서 열렸다'는 정보와 이 휴대폰의 알림 주소를 알려 준다.
 * 창구는 window.IROUN_APP 를 읽거나 'iroun-app' 이벤트를 받아, 로그인한 계정에 알림 주소를 연결한다.
 * 비밀값(로그인 정보·세션)은 들어 있지 않다.
 */
export function appInfoJs(platform: string, pushToken: string | null): string {
  const info = JSON.stringify({
    app: 'iroun', bridge: 1, version: APP_RELEASE_VERSION,
    platform: platform === 'ios' ? 'ios' : 'android', pushToken: validPushToken(pushToken),
    capabilities: { refundServices: true, navigation: 1 },
  });
  return `(function(){window.IROUN_APP=${info};try{window.dispatchEvent(new CustomEvent('iroun-app',{detail:window.IROUN_APP}));}catch(e){}})(); true;`;
}

/** 인증 앱·사진첩에서 돌아와도 입력과 서류 선택을 지우지 않고 웹에 복귀만 알린다. */
export function appResumeJs(platform: string, pushToken: string | null): string {
  return appInfoJs(platform, pushToken) + `(function(){try{window.dispatchEvent(new CustomEvent('iroun-app-resume',{detail:window.IROUN_APP}));}catch(e){}})(); true;`;
}

/** 웹이 먼저 창·입력 단계를 닫는다. 이미 만료된 요청은 늦게 실행돼도 화면을 바꾸지 않는다. */
export function appBackJs(requestId: string, deadline: number): string {
  const id = JSON.stringify(requestId);
  const expires = Number.isFinite(deadline) ? deadline : 0;
  return `(function(){var handled=false;try{if(Date.now()<=${expires}){var event=new CustomEvent('iroun-app-back',{detail:{requestId:${id}},cancelable:true});handled=!window.dispatchEvent(event);}}catch(e){}try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'app-back-result',requestId:${id},handled:handled}));}catch(e){}})(); true;`;
}

type ExternalTarget = { url: string; fallbackUrl?: string };

/** Linking에 직접 넘길 주소만 허용한다. intent는 아래에서 실제 앱 scheme으로 해석한다. */
function directExternalUrl(url: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /[\u0000-\u0020\u007f]/.test(url) || /%(?![\da-f]{2})/i.test(url)) return false;
  if (/^(?:intent|javascript|vbscript|file|content|data|blob|about):/i.test(url)) return false;
  if (/^https?:/i.test(url)) {
    try { const u = new URL(url); return !!u.hostname && !u.username && !u.password; } catch { return false; }
  }
  return true;
}

/**
 * Android intent URL은 Linking에서 해석되지 않으므로 실행할 scheme URL로 바꾼다.
 * package/component/기타 extra는 실행하지 않고, 실패 시 사용할 HTTPS 안내 주소만 받는다.
 */
export function resolveExternalUrl(value: string): ExternalTarget | null {
  const url = value.trim();
  if (!/^intent:/i.test(url)) return directExternalUrl(url) ? { url } : null;
  if (/[\u0000-\u0020\u007f]/.test(url) || /%(?![\da-f]{2})/i.test(url)) return null;
  const intent = /^intent:(.*?)#Intent;(.*);end$/i.exec(url);
  if (!intent) return null;
  let scheme: string | undefined, fallbackUrl: string | undefined;
  for (const part of intent[2].split(';')) {
    if (part.startsWith('scheme=')) {
      if (scheme !== undefined) return null;
      scheme = part.slice('scheme='.length);
    } else if (part.startsWith('S.browser_fallback_url=')) {
      if (fallbackUrl !== undefined) return null;
      try {
        const decoded = decodeURIComponent(part.slice('S.browser_fallback_url='.length));
        if (!/^https:\/\//i.test(decoded) || !directExternalUrl(decoded)) return null;
        fallbackUrl = new URL(decoded).href;
      } catch { return null; }
    }
  }
  if (!scheme || !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) return null;
  const primary = `${scheme.toLowerCase()}:${intent[1]}`;
  if (!directExternalUrl(primary)) return null;
  return { url: primary, ...(fallbackUrl ? { fallbackUrl } : {}) };
}

/** 앱 실행이 실패한 경우에만 검증된 HTTPS 안내 페이지를 연다. */
export async function openPortalExternalUrl(value: string, openURL: (url: string) => Promise<unknown>): Promise<void> {
  const target = resolveExternalUrl(value);
  if (!target) throw new Error('Unsupported external URL');
  try { await openURL(target.url); }
  catch (error) {
    if (!target.fallbackUrl) throw error;
    await openURL(target.fallbackUrl);
  }
}

/** 새 창·외부 앱으로 넘길 수 있는 주소인지 확인한다. 웹 실행 코드나 로컬 파일은 넘기지 않는다. */
export function canOpenExternalUrl(value: string): boolean {
  return resolveExternalUrl(value) !== null;
}
