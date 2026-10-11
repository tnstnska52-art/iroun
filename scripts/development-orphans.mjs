import {readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

const text = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const argv = pid => text(`/proc/${pid}/cmdline`).split('\0').filter(Boolean);
export function isOwnedServer(name, args) {
  if (name === 'api') return args.some(a => /(?:^|\/)dist\/index\.mjs$/.test(a));
  return name === 'expo' && args.includes('start') && args.some(a => /(?:\/expo\/bin\/cli|\/\.bin\/expo|\/@expo\/cli\/build\/bin\/cli)$/.test(a));
}
function hasLiveManager(pid) {
  const seen = new Set();
  while (pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    if (argv(pid).some(a => /(?:^|\/)development-service\.mjs$/.test(a))) return true;
    pid = Number(text(`/proc/${pid}/status`).match(/^PPid:\s*(\d+)/m)?.[1] ?? 0);
  }
  return false;
}

// Only reclaim this exact project's orphan server, never an arbitrary port owner.
export async function reclaimDevelopmentOrphans(name, cwd = process.cwd()) {
  for (const item of readdirSync('/proc')) {
    if (!/^\d+$/.test(item) || Number(item) === process.pid) continue;
    try {
      if (readlinkSync(`/proc/${item}/cwd`) !== cwd) continue;
      const args = argv(item);
      if (!isOwnedServer(name, args) || hasLiveManager(Number(item))) continue;
      const identity = text(`/proc/${item}/stat`);
      const started = identity.slice(identity.lastIndexOf(')') + 2).split(' ')[19];
      process.kill(Number(item), 'SIGTERM');
      console.log(`[${name}] stopping verified orphan server pid=${item}`);
      await delay(1000);
      const now = text(`/proc/${item}/stat`);
      if (now && now.slice(now.lastIndexOf(')') + 2).split(' ')[19] === started &&
          readlinkSync(`/proc/${item}/cwd`) === cwd && isOwnedServer(name, argv(item))) {
        process.kill(Number(item), 'SIGKILL');
      }
    } catch (error) {
      if (!['ESRCH', 'ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    }
  }
}
