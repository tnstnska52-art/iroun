// Observe transport metadata only. Never retain URLs, query strings, headers or bodies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const installed = Symbol.for('iroun.manifest.observer');
let sequence = 0;
function observe(req, res, write) {
  const route = String(req.url || '').split('?')[0];
  const routeClass = route === '/' ? 'root' : ['/manifest','/index.exp','/_expo/loading'].includes(route) ? 'manifest' : /\.(?:bundle|map|png|jpe?g|gif|woff2?|ttf|ico)$/i.test(route) ? 'asset' : 'other';
  const request = ++sequence;
  const platform = ['ios', 'android'].includes(req.headers['expo-platform']) ? req.headers['expo-platform'] : 'unspecified';
  const accept = String(req.headers.accept || '');
  const wants = /expo\+json|application\/json/.test(accept) ? 'json' : /text\/html/.test(accept) ? 'html' : 'other';
  const start = Date.now();
  const safeWrite = value => { try { write(value); } catch { /* Diagnostics must not interrupt requests. */ } };
  safeWrite({ at: new Date().toISOString(), event: 'arrived', request, routeClass, platform, wants });
  let done = false;
  const finish = aborted => {
    if (done) return;
    done = true;
    const content = String(res.getHeader('content-type') || '');
    const type = /html/.test(content) ? 'html' : /json/.test(content) ? 'json' : /multipart/.test(content) ? 'multipart' : /javascript/.test(content) ? 'javascript' : 'other';
    safeWrite({ at: new Date().toISOString(), event: aborted ? 'closed' : 'finished', request, routeClass, platform, wants, status: res.statusCode, type, elapsedMs: Date.now()-start });
  };
  res.once('finish', () => finish(false));
  res.once('close', () => finish(!res.writableFinished));
}
function install() {
  if (http.Server.prototype[installed]) return;
  http.Server.prototype[installed] = true;
  const file = path.resolve(__dirname, '../../../generated-artifacts/runtime/manifest-observer.jsonl');
  const write = row => {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    if (fs.existsSync(file) && fs.statSync(file).size > 262144) fs.renameSync(file, file+'.previous');
    fs.appendFileSync(file, JSON.stringify(row)+'\n');
  };
  const emit = http.Server.prototype.emit;
  try { write({at:new Date().toISOString(),event:'observer-start'}); } catch {}
  http.Server.prototype.emit = function(event, ...args) {
    if(event === 'request') { try { observe(args[0], args[1], write); } catch {} }
    return emit.call(this, event, ...args);
  };
}
module.exports = {observe, install};
