import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenExternalUrl, openPortalExternalUrl, resolveExternalUrl } from './customer-portal.ts';

const primary = 'pass://auth/path?request=sample';
const fallback = 'https://example.org/auth/install?from=app';
const intent = `intent://auth/path?request=sample#Intent;scheme=pass;package=example.auth;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;

test('intent links resolve to the installed app scheme and a separate HTTPS fallback', () => {
  assert.deepEqual(resolveExternalUrl(intent), { url: primary, fallbackUrl: fallback });
  assert.deepEqual(resolveExternalUrl('intent://auth#Intent;scheme=PASS;end'), { url: 'pass://auth' });
});

test('successful app handoff opens only the normalized URL and never the raw intent or fallback', async () => {
  const calls: string[] = [];
  await openPortalExternalUrl(intent, async url => { calls.push(url); });
  assert.deepEqual(calls, [primary]);
});

test('a failed app handoff opens the validated HTTPS fallback exactly once, in order', async () => {
  const calls: string[] = [];
  await openPortalExternalUrl(intent, async url => {
    calls.push(url);
    if (url === primary) throw new Error('App is not installed');
  });
  assert.deepEqual(calls, [primary, fallback]);
});

test('ordinary browser, telephone and auth-app URLs still pass directly to Linking', async () => {
  for (const original of ['https://example.org/guide', 'tel:0212345678', 'kakaotalk://auth', 'supertoss://auth']) {
    const calls: string[] = [];
    await openPortalExternalUrl(original, async url => { calls.push(url); });
    assert.deepEqual(calls, [original]);
  }
});

test('unsafe intent schemes, malformed fields and unsafe fallbacks never reach Linking', async () => {
  const invalid = [
    'intent://auth',
    'intent://auth#Intent;package=example.auth;end',
    'intent://auth#Intent;scheme=pass;scheme=other;end',
    'intent://auth/%ZZ#Intent;scheme=pass;end',
    'intent://auth#Intent;scheme=pass;S.browser_fallback_url=%ZZ;end',
    'intent://auth#Intent;scheme=pass;S.browser_fallback_url=%FF;end',
    'intent://auth#Intent;scheme=pass;S.browser_fallback_url=https%3A%2F%2Fexample.org;S.browser_fallback_url=https%3A%2F%2Fother.example.org;end',
    ...['intent', 'javascript', 'vbscript', 'file', 'content', 'data', 'blob', 'about', 'pass%3A'].map(scheme => `intent://auth#Intent;scheme=${scheme};end`),
    ...['javascript:alert(1)', 'file:///private/file', 'intent://auth#Intent;scheme=pass;end', 'http://example.org', 'https://user:secret@example.org', 'https://example.org/%XX', 'https://example.org/\npath'].map(url => `intent://auth#Intent;scheme=pass;S.browser_fallback_url=${encodeURIComponent(url)};end`),
  ];
  for (const url of invalid) {
    assert.equal(resolveExternalUrl(url), null, url);
    assert.equal(canOpenExternalUrl(url), false, url);
    const calls: string[] = [];
    await assert.rejects(openPortalExternalUrl(url, async target => { calls.push(target); }), /Unsupported external URL/);
    assert.deepEqual(calls, [], url);
  }
});

test('handoff failures remain visible when there is no usable fallback or the browser also fails', async () => {
  const unavailable = new Error('No handler');
  const calls: string[] = [];
  await assert.rejects(openPortalExternalUrl(intent, async url => { calls.push(url); throw unavailable; }), unavailable);
  assert.deepEqual(calls, [primary, fallback]);
  calls.length = 0;
  await assert.rejects(openPortalExternalUrl('intent://auth#Intent;scheme=pass;end', async url => { calls.push(url); throw unavailable; }), unavailable);
  assert.deepEqual(calls, ['pass://auth']);
});
