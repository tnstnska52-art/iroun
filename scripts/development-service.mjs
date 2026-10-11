import {fileURLToPath} from 'node:url';
import {startDevelopmentService} from './development-lifecycle.mjs';
import {reclaimDevelopmentOrphans} from './development-orphans.mjs';

const name=process.argv[2];
if(!['api','expo'].includes(name))throw new Error('Unknown development service');
await reclaimDevelopmentOrphans(name);
startDevelopmentService({
  name,
  logDir:fileURLToPath(new URL('../generated-artifacts/runtime/',import.meta.url)),
  command:'pnpm',
  args:['run','dev:direct'],
});
