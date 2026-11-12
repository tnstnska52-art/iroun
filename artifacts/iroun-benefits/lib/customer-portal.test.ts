import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_PORTAL_URL, DOWNLOAD_BRIDGE_JS, appInfoJs, createCustomerPortalLauncher, safeFileName, staysInApp, validPushToken } from './customer-portal.ts';

const url = 'https://go.irowoon.com/package-conditions';
function setup(platform = 'ios', type = 'cancel') {
  const calls: Array<[string, string]> = [];
  const launch = createCustomerPortalLauncher({
    platform,
    openInApp: async target => { calls.push(['app', target]); return { type }; },
    openExternal: async target => { calls.push(['external', target]); },
    openWeb: target => { calls.push(['web', target]); },
  });
  return { launch, calls };
}

test('all surfaces use the identical credential-free customer portal address', () => {
  assert.equal(CUSTOMER_PORTAL_URL, url);
  const parsed = new URL(CUSTOMER_PORTAL_URL);
  assert.equal(parsed.protocol, 'https:');
  for (const part of ['username', 'password', 'search', 'hash'] as const) assert.equal(parsed[part], '');
});
for (const platform of ['ios', 'android']) {
  for (const type of ['opened', 'cancel', 'dismiss']) test(`${platform}: ${type} is not a submission receipt or a read acknowledgement`, async () => {
    const { launch, calls } = setup(platform, type);
    assert.equal(await launch(), type === 'opened' ? 'opened' : 'closed');
    assert.deepEqual(calls, [['app', url]]);
  });
  test(`${platform}: external browser is an explicit choice`, async () => {
    const { launch, calls } = setup(platform);
    assert.equal(await launch(true), 'opened');
    assert.deepEqual(calls, [['external', url]]);
  });
}
test('web uses same-tab navigation, including retry from the fallback', async () => {
  const { launch, calls } = setup('web');
  assert.equal(await launch(), 'opened');
  assert.equal(await launch(true), 'opened');
  assert.deepEqual(calls, [['web', url], ['web', url]]);
});
test('rapid repeated taps open one browser; dismiss permits reopening', async () => {
  let complete!: (result: { type: string }) => void;
  let count = 0;
  const launch = createCustomerPortalLauncher({ platform:'ios', openInApp: () => {
    count++; return new Promise(resolve => { complete = resolve; });
  }, openExternal:async () => { throw Error('unexpected fallback'); }, openWeb:() => { throw Error('unexpected web'); } });
  const first = launch();
  assert.deepEqual(await Promise.all(Array.from({length:1000}, () => launch())), Array(1000).fill('busy'));
  assert.equal(count,1);
  complete({type:'cancel'}); assert.equal(await first,'closed');
  const second=launch(); assert.equal(count,2); complete({type:'dismiss'}); await second;
});
test('native opening failures propagate and allow an explicit fallback', async () => {
  let count=0; const failure=Error('offline'); const calls:string[]=[];
  const launch=createCustomerPortalLauncher({platform:'android',openInApp:async()=>{count++;throw failure;},openExternal:async target=>{calls.push(target);},openWeb:()=>{throw Error('unexpected');}});
  await assert.rejects(launch(), failure);
  assert.equal(count,1); assert.deepEqual(calls,[]);
  assert.equal(await launch(true),'opened'); assert.deepEqual(calls,[url]);
  await assert.rejects(launch(),failure); assert.equal(count,2);
});
test('unknown native results fail rather than claiming the portal opened', async () => {
  const {launch}=setup('ios','locked');
  await assert.rejects(launch(),/could not be opened/);
  await assert.rejects(launch(),/could not be opened/);
});
test('failed external and web navigation can be retried', async () => {
  for(const platform of ['android','web']){
    let calls=0;
    const fail=()=>{calls++;throw Error('blocked');};
    const launch=createCustomerPortalLauncher({platform,openInApp:async()=>({type:'opened'}),openExternal:async()=>fail(),openWeb:fail});
    await assert.rejects(launch(true),/blocked/); await assert.rejects(launch(true),/blocked/);
    assert.equal(calls,2);
  }
});

test('only the company portal stays inside the app screen', () => {
  assert.equal(staysInApp(CUSTOMER_PORTAL_URL), true);
  assert.equal(staysInApp('https://irowoon.com/check'), true);
  assert.equal(staysInApp('blob:https://go.irowoon.com/123'), true);
  assert.equal(staysInApp('about:blank'), true);
  assert.equal(staysInApp('http://go.irowoon.com/x'), false);
  assert.equal(staysInApp('https://www.gov.kr/portal'), false);
  assert.equal(staysInApp('https://irowoon.com.evil.example/'), false);
  assert.equal(staysInApp('https://evilirowoon.com/'), false);
  assert.equal(staysInApp('tel:0212345678'), false);
  assert.equal(staysInApp('kakaotalk://open'), false);
});

test('download bridge only intercepts blob/data downloads and file names are safe', () => {
  assert.match(DOWNLOAD_BRIDGE_JS, /download/);
  assert.match(DOWNLOAD_BRIDGE_JS, /blob:\|data:/);
  assert.equal(safeFileName('../../사업자등록증.pdf'), '_.._사업자등록증.pdf'.replace(/^\.+/, ''));
  assert.equal(safeFileName('a/b:c.pdf'), 'a_b_c.pdf');
  assert.equal(safeFileName(''), 'file');
});

test('app info passes only a well-formed push token and no secrets', () => {
  const ok = 'ExponentPushToken[abcDEF123_-xyz]';
  assert.equal(validPushToken(ok), ok);
  assert.equal(validPushToken('ExponentPushToken[");alert(1)//]'), null);
  assert.equal(validPushToken(''), null);
  const js = appInfoJs('ios', ok);
  assert.match(js, /"pushToken":"ExponentPushToken\[abcDEF123_-xyz\]"/);
  assert.match(js, /"platform":"ios"/);
  assert.match(appInfoJs('android', 'bad'), /"pushToken":null/);
});
