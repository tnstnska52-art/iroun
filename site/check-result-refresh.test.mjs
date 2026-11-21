// 조회 결과 화면 다듬기(2026-11): 동의 화면의 선택지, 상세 창 버튼, 합계 숫자 움직임, 두 파일의 일치.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const widget=read('./check-v2.html'),page=read('./renewal/check.html');
const script=html=>html.match(/<script>([\s\S]*?)<\/script>/)[1];
const css=html=>[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).find(text=>text.trimStart().startsWith('#chk2,#c2-modal{--ink'));
const source=script(widget);
new vm.Script(source);

// 아임웹에 올리는 페이지와 위젯 단독 파일은 같은 코드·같은 스타일이어야 한다.
assert.equal(script(page),source,'renewal/check.html 과 check-v2.html 의 스크립트가 같다');
assert.equal(css(page),css(widget),'두 파일의 조회 스타일이 같다');

// 동의 화면: 광고 수신은 선택이다. 큰 「알림 없이 확인하기」 버튼은 없지만, 받지 않는 선택지는 남아 있어야 한다.
assert.ok(!source.includes('알림 없이 확인하기'),'큰 버튼 문구는 없다');
assert.ok(!/class="c2-btn[^"]*" id="j-no"/.test(source),'받지 않는 선택지는 버튼 모양이 아니다');
assert.match(source,/<button type="button" class="c2-skip" id="j-no">알림은 받지 않고 결과만 볼게요<\/button>/);
assert.match(source,/#j-go'\)\.onclick=function\(\)\{submitJoin\(true\);\};sheet\.querySelector\('#j-no'\)\.onclick=function\(\)\{submitJoin\(false\);\};/,'두 선택 모두 결과를 연다');
assert.ok(source.includes('[선택] 광고성 정보 수신 동의')&&source.includes('동의하지 않아도 결과를 받을 수 있습니다'),'선택 동의 안내가 그대로 있다');
assert.match(css(widget),/#c2-modal \.c2-skip\{[^}]*text-decoration:underline/);

// 상세 창: 공식 신청 페이지만 남기고 회사 도움 요청 버튼은 그리지 않는다.
const acts=source.match(/h\+='<div class="c2-acts">'[^\n]+/)[0];
assert.ok(acts.includes('공식 신청 페이지')&&!acts.includes('helpBtn('),'상세 창에 도움 요청 버튼이 없다');

// 합계 숫자: 숫자만 따로 감싸 0에서 올라가게 하고, 다시 그릴 때는 한 번만 움직인다.
assert.match(source,/function countTotals\(\)\{[^\n]*S\.totalsDone=true/);
assert.equal((source.match(/box\.innerHTML=h;countTotals\(\);/g)||[]).length,2,'가입 전·후 결과 화면 모두에서 부른다');
// 실제 함수로 합계 카드를 그려 본다.
const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',value:'',style:{},querySelector:s=>node(s),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:10}),focus(){}});return nodes.get(key);};
const context=vm.createContext({document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},Date,URLSearchParams,location:{search:'',hash:''},setTimeout,clearTimeout,setInterval,clearInterval,console,fetch:()=>new Promise(()=>{}),navigator:{},window:{}});
vm.runInContext(source.slice(0,source.indexOf('(async function init()'))+'globalThis.api={totalCard,countTotals,S};})();',context);
const card=(total,red)=>context.api.totalCard('신청 가능 지원금',{items:[{result:'확인'}],total,sureTotal:0},red,null,'data-list="now"');
assert.match(card(22000000,false),/<div class="m"><span class="c2-cnt" data-n="2200">2,200<\/span><small>만원<\/small><\/div>/);
assert.match(card(101600000,true),/<span class="c2-cnt" data-n="1">1<\/span><small>억<\/small> <span class="c2-cnt" data-n="160">160<\/span><small>만원<\/small>/);
assert.ok(!card(0,false).includes('c2-cnt'),'금액이 없으면 숫자를 그리지 않는다');
context.api.countTotals();assert.equal(context.api.S.totalsDone,undefined,'숫자가 없는 화면에서는 아무 일도 하지 않는다');

// 결과 화면 스타일: 계약자 화면과 같은 글꼴, 줄 높이 65 + 간격 8 = 넘김 계산의 73.
const style=css(widget);
assert.match(style,/#chk2,\.doz_sys #c2-modal\{font-family:"Pretendard Variable"/);
assert.match(style,/\.c2-roll \.c2-row\{height:65px/);assert.match(style,/\.c2-list\{display:grid;gap:8px/);
assert.match(source,/translateY\('\+\(-off\*73\)\+'px\)/,'넘김 간격은 73px');
assert.ok(page.includes('pretendardvariable-dynamic-subset.min.css'),'Pretendard 글꼴을 불러온다');
console.log('PASS: consent choice kept as a text link, no help button in detail, counted totals, matching files and refreshed result styles');
