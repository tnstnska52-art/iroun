// 사용법: node tips/cards/render.mjs tips/cards/sets/<날짜>/<slug>/card.json
// card.json 옆에 1.jpg ~ N.jpg (1080x1350, 인스타 API용 JPEG) 를 만든다.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // 미리 설치된 playwright 사용
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(process.argv[2]);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
for (const k of ['slug', 'cover', 'cards', 'caption']) if (!spec[k]) throw new Error(`빠진 항목: ${k}`);
const bad = ['무조건', '100% 승인', '100% 지급', '확정 지급', '누구나 받는'];
const all = JSON.stringify(spec);
for (const b of bad) if (all.includes(b)) throw new Error(`과장 표현 '${b}' 포함`);
if (spec.cards.length < 3 || spec.cards.length > 5) throw new Error('본문 카드는 3~5장');
const html = fs.readFileSync(path.join(here, 'template.html'), 'utf8')
  .replace('<script>', `<script>window.SPEC=${JSON.stringify(spec)};</script><script>`);
const tmp = path.join(here, '_render.html'); fs.writeFileSync(tmp, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(tmp).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
await p.reload(); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
const secs = await p.$$('section');
const out = path.dirname(specPath);
for (let i = 0; i < secs.length; i++) {
  // 글자가 넘치면(가로) 실패로 본다
  const over = await secs[i].evaluate(e => [...e.querySelectorAll('.line')].some(l => l.getBoundingClientRect().width > 1040)
    || e.scrollHeight > e.clientHeight);
  if (over) throw new Error(`${i + 1}번 카드 내용이 넘칩니다 (문구를 줄이거나 fs 조정)`);
  await secs[i].screenshot({ path: path.join(out, `${i + 1}.jpg`), type: 'jpeg', quality: 92 });
}
fs.writeFileSync(path.join(out, 'caption.txt'), spec.caption);
await b.close(); fs.unlinkSync(tmp);
console.log(spec.slug, secs.length, 'cards');
