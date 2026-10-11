import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isOwnedServer} from './development-orphans.mjs';
import {reclaimDevelopmentOrphans} from './development-orphans.mjs';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('only exact known app server commands are eligible for orphan recovery', () => {
  assert.equal(isOwnedServer('api', ['node','./dist/index.mjs']), true);
  assert.equal(isOwnedServer('expo', ['node','/app/node_modules/.bin/expo','start','--port','24886']), true);
  assert.equal(isOwnedServer('expo', ['node','/app/node_modules/expo/bin/cli','start']), true);
  assert.equal(isOwnedServer('api', ['node','unrelated.js']), false);
  assert.equal(isOwnedServer('expo', ['node','/app/node_modules/.bin/expo','export']), false);
  assert.equal(isOwnedServer('expo', ['node','/app/node_modules/.bin/expo','install']), false);
  assert.equal(isOwnedServer('api', ['node','./dist/index.mjs.backup']), false);
});

test('isolated same-project orphan is stopped, unrelated process survives', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'iroun-orphan-test-'));
  mkdirSync(join(cwd, 'dist'));
  writeFileSync(join(cwd, 'dist/index.mjs'), 'setInterval(()=>{},1000)');
  const owned = spawn(process.execPath, ['./dist/index.mjs'], {cwd, stdio:'ignore'});
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {cwd, stdio:'ignore'});
  try {
    await Promise.all([once(owned,'spawn'),once(unrelated,'spawn')]);
    const exit = once(owned,'exit');
    await reclaimDevelopmentOrphans('api',cwd);
    await exit;
    assert.equal(owned.signalCode,'SIGTERM');
    assert.equal(unrelated.exitCode,null);
    assert.equal(unrelated.signalCode,null);
  } finally {
    owned.kill(); unrelated.kill();
    rmSync(cwd,{recursive:true,force:true});
  }
});
