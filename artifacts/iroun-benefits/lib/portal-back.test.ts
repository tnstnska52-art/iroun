import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPortalBackController } from './portal-back.ts';
import { APP_RELEASE_VERSION, appBackJs, appInfoJs, appResumeJs, canOpenExternalUrl } from './customer-portal.ts';
import { resolveAppMode } from './app-mode.ts';

function controller() {
  let time = 1000, fallback = 0, timeout = 0;
  const requests: Array<{ id: string; deadline: number }> = [];
  const timers = new Map<() => void, number>();
  const back = createPortalBackController({
    now: () => time,
    timeoutMs: 100,
    schedule: (callback, delay) => { timers.set(callback, time + delay); return () => { timers.delete(callback); }; },
    send: (id, deadline) => { requests.push({ id, deadline }); },
    fallback: () => { fallback++; },
    onTimeout: () => { timeout++; },
  });
  return {
    back, requests,
    get fallback() { return fallback; },
    get timeout() { return timeout; },
    advance(ms: number) { time += ms; for (const [callback, at] of [...timers]) if (at <= time) callback(); },
  };
}

const result = (requestId: string, handled: boolean) => ({ type: 'app-back-result', requestId, handled });

test('web-handled back leaves native history alone and duplicate acknowledgements cannot navigate', () => {
  const state = controller();
  const id = state.back.request();
  assert.equal(state.back.receive(result(id, true)), true);
  assert.equal(state.back.receive(result(id, false)), false);
  state.advance(1000);
  assert.equal(state.fallback, 0);
  assert.equal(state.timeout, 0);
});

test('unhandled back navigates native history or exits once', () => {
  const state = controller();
  const id = state.back.request();
  assert.equal(state.back.receive(result(id, false)), true);
  assert.equal(state.back.receive(result(id, false)), false);
  state.advance(1000);
  assert.equal(state.fallback, 1);
  assert.equal(state.timeout, 0);
});

test('rapid hardware presses share one request while waiting for the web', () => {
  const state = controller();
  const id = state.back.request();
  for (let count = 0; count < 1000; count++) assert.equal(state.back.request(), id);
  assert.equal(state.requests.length, 1);
  state.back.receive(result(id, true));
  assert.notEqual(state.back.request(), id);
  assert.equal(state.requests.length, 2);
});

test('a lost or late acknowledgement cannot discard a form or exit the app', () => {
  const state = controller();
  const old = state.back.request();
  state.advance(101);
  assert.equal(state.timeout, 1);
  assert.equal(state.fallback, 0);
  const current = state.back.request();
  assert.equal(state.back.receive(result(old, false)), false);
  assert.equal(state.back.receive(result(current, true)), true);
  assert.equal(state.back.receive({ ...result(current, false), handled: 'false' }), false);
  assert.equal(state.fallback, 0);
});

test('page changes and unmount cancel the pending back request', () => {
  const state = controller();
  const id = state.back.request();
  state.back.cancel();
  state.advance(101);
  assert.equal(state.back.receive(result(id, false)), false);
  assert.equal(state.fallback, 0);
  assert.equal(state.timeout, 0);
});

test('a failed injection permits a later retry without falling through to app exit', () => {
  let sends = 0, timeouts = 0, fallbacks = 0;
  const back = createPortalBackController({
    send: () => { sends++; throw Error('process stopped'); },
    fallback: () => { fallbacks++; },
    onTimeout: () => { timeouts++; },
  });
  back.request(); back.request();
  assert.equal(sends, 2);
  assert.equal(timeouts, 2);
  assert.equal(fallbacks, 0);
  back.cancel();
});

function web() {
  const window = new EventTarget() as EventTarget & { IROUN_APP?: unknown; ReactNativeWebView: { postMessage: (data: string) => void } };
  const messages: unknown[] = [];
  window.ReactNativeWebView = { postMessage: (data: string) => { messages.push(JSON.parse(data)); } };
  let time = 1000;
  const run = (script: string) => vm.runInNewContext(script, { window, CustomEvent, Date: { now: () => time } });
  return { window, messages, run, setTime(value: number) { time = value; } };
}

test('injected back respects preventDefault and its acknowledgement matches the native protocol', () => {
  const page = web();
  const requestId = 'request-1';
  page.window.addEventListener('iroun-app-back', event => {
    assert.equal((event as CustomEvent).detail.requestId, requestId);
    event.preventDefault();
  });
  page.run(appBackJs(requestId, 1100));
  assert.deepEqual(page.messages, [result(requestId, true)]);
});

test('old web versions fall through; expired JavaScript cannot perform an extra back later', () => {
  const page = web();
  page.run(appBackJs('old-web', 1100));
  assert.deepEqual(page.messages, [result('old-web', false)]);
  let navigations = 0;
  page.window.addEventListener('iroun-app-back', event => { navigations++; event.preventDefault(); });
  page.setTime(1200);
  page.run(appBackJs('expired', 1100));
  assert.equal(navigations, 0);
  assert.deepEqual(page.messages[1], result('expired', false));
});

test('1.2.0 advertises the same bridge and new refund/navigation capabilities', () => {
  const page = web();
  page.run(appInfoJs('android', 'not-a-token'));
  assert.deepEqual(JSON.parse(JSON.stringify(page.window.IROUN_APP)), {
    app: 'iroun', bridge: 1, version: APP_RELEASE_VERSION, platform: 'android', pushToken: null,
    capabilities: { refundServices: true, navigation: 1 },
  });
});

test('app resume announces the existing page without reloading or replacing its state', () => {
  const page = web();
  const draft = { message: '작성 중 문의', selectedDocument: 'sample.pdf', step: 3 };
  const documentState = { draft, reloads: 0 };
  Object.assign(page.window, {
    documentState,
    location: { reload: () => { documentState.reloads++; documentState.draft = { message: '', selectedDocument: '', step: 0 }; } },
  });
  let resumes = 0;
  page.window.addEventListener('iroun-app-resume', () => { resumes++; });
  page.run(appResumeJs('ios', null));
  assert.equal(resumes, 1);
  assert.equal(documentState.reloads, 0);
  assert.equal(documentState.draft, draft);
  assert.deepEqual(documentState.draft, { message: '작성 중 문의', selectedDocument: 'sample.pdf', step: 3 });
});

test('external navigation allows installed auth apps but rejects script and local-file URLs', () => {
  for (const url of ['https://www.gov.kr/', 'tel:0212345678', 'kakaotalk://open', 'supertoss://auth', 'intent://auth#Intent;scheme=pass;end']) assert.equal(canOpenExternalUrl(url), true, url);
  for (const url of ['javascript:alert(1)', 'file:///private/file', 'data:text/html,hello', 'blob:https://go.irowoon.com/id', 'about:blank', '/relative']) assert.equal(canOpenExternalUrl(url), false, url);
});

test('production always opens the current CRM even if old mode or preview flags leak in', () => {
  for (const mode of [undefined, 'portal', 'benefits']) for (const preview of [undefined, '0', '1']) assert.equal(resolveAppMode('production', mode, preview), 'portal');
  assert.equal(resolveAppMode(undefined, 'benefits', undefined), 'benefits');
  assert.equal(resolveAppMode(undefined, undefined, '1'), 'benefits');
  assert.equal(resolveAppMode(undefined, undefined, undefined), 'portal');
});
