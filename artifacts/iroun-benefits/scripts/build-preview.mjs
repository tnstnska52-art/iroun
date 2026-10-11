// 미리보기 페이지 묶음 만들기: expo 웹 빌드 결과를 "page.html + app.js" 두 파일로 정리한다.
// 사용: node scripts/build-preview.mjs <expo export 폴더> <출력 폴더>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const [dist, out] = process.argv.slice(2);
if (!dist || !out) { console.error('사용법: node scripts/build-preview.mjs <dist> <out>'); process.exit(1); }
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dist);
const jsPath = files.find((f) => /_expo\/static\/js\/web\/entry-.*\.js$/.test(f));
let js = readFileSync(jsPath, 'utf8');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');

// 실제로 쓰는 글꼴·작은 이미지만 파일 안에 넣는다(화면 틀에서는 바깥 경로를 불러올 수 없다).
const MIME = { '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
const wanted = (rel, size) => /Inter_(400Regular|500Medium|600SemiBold|700Bold)\.[a-f0-9]+\.ttf$/.test(rel) || /Fonts\/(Feather|MaterialCommunityIcons)\./.test(rel) || (size < 60000 && extname(rel) === '.png');
let inlined = 0, bytes = 0;
for (const f of files.filter((x) => x.includes('/assets/'))) {
  const rel = '/' + relative(dist, f), size = statSync(f).size;
  if (!js.includes(rel) || !wanted(rel, size) || !MIME[extname(f)]) continue;
  js = js.split(rel).join(`data:${MIME[extname(f)]};base64,${readFileSync(f).toString('base64')}`);
  inlined++; bytes += size;
}

const page = `<title>이로운사람들 미리보기</title>
<style>
  :root { --frame: #F2F4F7; --ink: #191F28; color-scheme: light; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--frame); color: var(--ink); font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif; }
  #root { display: flex; height: 100%; flex: 1; }
  #boot { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #334155; }
${css}
</style>
<div id="root"><div id="boot">화면을 준비하고 있어요…</div></div>
<script src="app.js" defer></script>
<script>
  // 앱의 화면 주소는 "/"부터 시작한다. 페이지가 다른 주소에 올라가 있어도 첫 화면이 열리게 맞춘다.
  (function () {
    // 글꼴 파일은 이 페이지와 같은 자리에 있다. 화면 주소를 바꾸기 전에 전체 주소로 등록해 둔다.
    try {
      var base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
      var face = document.createElement("style");
      face.textContent = '@font-face{font-family:Pretendard;font-weight:45 920;font-display:swap;src:url("' + base + 'pretendard.woff2") format("woff2-variations"),url("' + base + 'pretendard.woff2") format("woff2")}';
      document.head.appendChild(face);
    } catch (e) {}
    try { history.replaceState(null, "", "/"); } catch (e) {}
    ["pushState", "replaceState"].forEach(function (name) {
      var original = history[name].bind(history);
      history[name] = function () { try { return original.apply(null, arguments); } catch (e) { /* 주소 변경이 막혀도 화면 이동은 계속한다 */ } };
    });
  })();
</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'page.html'), page);
writeFileSync(join(out, 'app.js'), js);
writeFileSync(join(out, 'pretendard.woff2'), readFileSync(new URL('../preview/fonts/PretendardVariable.woff2', import.meta.url)));
console.log(JSON.stringify({ inlinedAssets: inlined, inlinedKB: Math.round(bytes / 1024), appJsMB: +(Buffer.byteLength(js) / 1048576).toFixed(2) }));
