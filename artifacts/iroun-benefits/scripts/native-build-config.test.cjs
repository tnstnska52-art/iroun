const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nativeBuildProblems } = require('./native-build-config.cjs');
const base = require('../app.json').expo;
const env = {
  EXPO_PUBLIC_DOMAIN: 'api.example.test',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'REDACTED_CREDENTIAL',
};
const ready = {
  ...base,
  extra: { eas: { projectId: "REDACTED_LONG_LITERAL" } },
  ios: { ...base.ios, bundleIdentifier: 'test.example.iroun' },
  android: { package: 'test.example.iroun', googleServicesFile: '/test-only/google-services.json' },
};
test('static app.json is the only Expo config', () => {
  assert.ok(base.plugins.includes('expo-notifications'));
  for (const file of ['app.config.js', 'app.config.ts']) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', file)), false);
  }
});
test('missing native settings are reported without mutating the config', () => {
  const before = JSON.stringify(base);
  assert.ok(nativeBuildProblems(base, {}).length >= 5);
  assert.equal(JSON.stringify(base), before);
});
test('account names are never accepted as project UUIDs', () => {
  const bad = { ...ready, extra: { eas: { projectId: 'replit-private-not-a-project-id' } } };
  assert.ok(nativeBuildProblems(bad, env).some(p => p.startsWith('extra.eas.projectId:')));
  assert.deepEqual(nativeBuildProblems(ready, env), []);
});
test('iOS build does not require Firebase, Android does not require iOS ID', () => {
  assert.deepEqual(nativeBuildProblems({ ...ready, android: {} }, env, 'ios'), []);
  assert.deepEqual(nativeBuildProblems({ ...ready, ios: {} }, env, 'android'), []);
});
test('API URL must be a host rather than localhost or a full URL', () => {
  for (const host of ['localhost', 'https://example.test', 'example.test/api']) {
    assert.ok(nativeBuildProblems(ready, { ...env, EXPO_PUBLIC_DOMAIN: host }).some(p => p.startsWith('EXPO_PUBLIC_DOMAIN:')));
  }
});
