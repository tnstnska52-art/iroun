// Contract customers use the same CRM session and records on every surface.
// Never append app tokens, phone numbers, or customer IDs to this URL.
export const CUSTOMER_PORTAL_URL = 'https://go.irowoon.com/package-conditions';

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
  if (window.__irounBridge) return; window.__irounBridge = true; window.IROUN_APP = true;
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
