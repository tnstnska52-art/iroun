// 무료 회원 서비스(2026-11): 조건을 설정하고 이름·번호를 남긴 고객에게만 아래쪽 탭(정책자금·홈·환급금)을 보여 주고,
// 처음 안내 두 장을 모두 확인해야 쓸 수 있으며, 한 번 조건을 설정한 기기에서는 그 조건의 결과부터 보여 준다.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const widget=read('./check-v2.html'),page=read('./renewal/check.html');
const script=html=>html.match(/<script>([\s\S]*?)<\/script>/)[1];
const css=html=>[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).find(text=>text.trimStart().startsWith('#chk2,#c2-modal{--ink'));
const source=script(page);
new vm.Script(source);
assert.equal(script(widget),source,'두 파일의 스크립트가 같다');
assert.equal(css(page),css(widget),'두 파일의 조회 스타일이 같다');

// 전산 화면은 회사 주소로만 열고, 이름·번호·조건을 주소에 넣지 않는다.
assert.match(source,/f\.src=freeOrigin\(\)\+'\/free#'\+tab;/,'틀의 주소에는 탭 이름만 들어간다');
assert.ok(!/free[?&#][^'"]*(name|phone|tel)=/.test(source),'주소에 이름·번호를 넣지 않는다');
assert.match(source,/postMessage\(msg,freeOrigin\(\)\)/,'메시지는 전산 주소로만 보낸다');
assert.match(source,/e\.origin!==freeOrigin\(\)\|\|!S\.frame\|\|e\.source!==S\.frame\.contentWindow/,'전산 틀에서 온 메시지만 받는다');
// 통신환급 최대 금액 문구(전산 금액표의 최대 금액 1,280,000원과 같아야 한다)
assert.match(source,/var FREE_TELECOM_MAX='128만원';/);
const style=css(page);
assert.match(style,/html\.c2-free \.mbar,html\.c2-free #floatCta\{display:none!important\}/,'탭이 보일 때는 「내 지원금 확인하기」 버튼을 숨긴다');
assert.match(style,/#c2-fnav\{[^}]*grid-template-columns:repeat\(3,/);
assert.match(style,/#c2-fnav\[data-spot\]\{[^}]*pointer-events:none/,'안내가 떠 있는 동안에는 탭이 눌리지 않는다');
assert.ok(!/font:[^;}]*inherit/.test(style),'font 줄임 속성에 inherit를 쓰지 않는다(브라우저가 그 줄 전체를 버린다)');

// ── 실제 함수를 작은 가짜 화면에서 돌려 본다 ──
function element(tag){
 const el={tagName:tag.toUpperCase(),children:[],attrs:{},hidden:false,style:{},className:'',_html:'',onclick:null,parentNode:null,
  setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return k in this.attrs?this.attrs[k]:null;},removeAttribute(k){delete this.attrs[k];},
  appendChild(c){c.parentNode=this;this.children.push(c);return c;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);},
  focus(){},click(){this.onclick&&this.onclick();},getBoundingClientRect:()=>({top:10}),
  // innerHTML 안의 버튼만 요소로 만든다(탭과 확인 버튼을 누르는 데 충분하다)
  set innerHTML(v){this._html=String(v);this.buttons=[...this._html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>{const b=element('button');for(const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g))b.attrs[a[1]]=a[2];b.className=b.attrs.class||'';b.text=m[2].replace(/<[^>]+>/g,'');return b;});},
  get innerHTML(){return this._html;},
  querySelectorAll(sel){return sel==='button'?(this.buttons||[]):[];},
  querySelector(sel){if(sel.startsWith('.')){const hit=(this.buttons||[]).find(b=>b.className.split(' ').includes(sel.slice(1)));if(hit)return hit;if(this._html.includes('class="'+sel.slice(1)))return element('div');}return null;}};
 return el;
}
function boot({answers,member,seen,host='www.irowoon.com',override}){
 const store=new Map();if(answers)store.set('irw_c2_ans',JSON.stringify(answers));if(member)store.set('irw_check_member',JSON.stringify(member));if(seen)store.set('irw_free_intro','1');
 store.set('iroun_staff_ref_v1',JSON.stringify({token:'a'.repeat(64),delivery:'d'.repeat(22),expires:Date.now()+86400000}));
 const byId=new Map(),get=id=>{if(!byId.has(id))byId.set(id,element('div'));return byId.get(id);};get('c2-modal').hidden=true;
 const body=element('body'),root=element('html'),classes=new Set(),listeners={},posted=[];
 root.classList={toggle(name,on){on?classes.add(name):classes.delete(name);},contains:name=>classes.has(name)};
 const window={addEventListener(type,fn){listeners[type]=fn;},scrollTo(){},IRW_FREE_ORIGIN:override};
 const context=vm.createContext({document:{getElementById:get,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:tag=>{const el=element(tag);if(tag==='iframe')el.contentWindow={postMessage:(msg,origin)=>posted.push({msg,origin})};return el;},body,documentElement:root},
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},Date,URLSearchParams,location:{search:'',hash:'',hostname:host},setTimeout:fn=>{fn();return 0;},clearTimeout(){},setInterval:()=>0,clearInterval(){},console,fetch:()=>new Promise(()=>{}),navigator:{},window,innerHeight:800,scrollY:0,requestAnimationFrame(){}});
 vm.runInContext(source.slice(0,source.indexOf('(async function init()'))+'globalThis.api={S,freeOk,freeSync,freeIntro,freeOpen,freeHome,freeIdentity,freeOrigin,renderHome,hasProfile,load,calls:{render:0}};renderR=function(){S.view="r";api.calls.render++;};})();',context);
 return {api:context.api,store,body,root,classes,listeners,posted,window};
}
const year=new Date(Date.now()+9*3600000).getUTCFullYear();
const done={questionnaireVersion:2,revenueYear:year,done:true,bizName:'가상분식',entity:'개인',industry:'음식점',province:'경기도',district:'시흥시',openedYear:2021,revNow:'1000~5000만원',revLast:'5000만원~1억',premises:'임차',policyFund:'X',credit:'700~750점',currentArrears:'X'};
const member={name:'검증대표',tel:'010-1234-5678',at:'2026-11-21T00:00:00.000Z'};

// 1. 탭은 조건 설정을 마치고 이름·번호를 남긴 고객에게만 보인다
for(const [label,state] of [['조건만 설정',{answers:done}],['이름·번호만',{member,answers:{questionnaireVersion:2,revenueYear:year}}],['조건을 끝내지 않음',{member,answers:{...done,done:false}}]]){
 const t=boot(state);t.api.S.view='r';t.api.freeSync();
 assert.equal(t.api.freeOk(),false,label);assert.equal(t.api.S.fnav.hidden,true,label+': 탭을 숨긴다');assert.ok(!t.classes.has('c2-free'),label);
 t.api.freeOpen('loans');assert.equal(t.api.S.frame,undefined,label+': 전산 화면을 열지 않는다');
}
const t=boot({answers:done,member,seen:true});t.api.S.view='r';t.api.freeSync();
assert.equal(t.api.freeOk(),true);assert.equal(t.api.S.fnav.hidden,false);assert.ok(t.classes.has('c2-free'));
const tabs=t.api.S.fnav.querySelectorAll('button');
assert.deepEqual(tabs.map(b=>[b.getAttribute('data-fnav'),b.text]),[['loans','정책자금'],['home','홈'],['refunds','환급금']],'왼쪽 정책자금 · 가운데 홈 · 오른쪽 환급금');
assert.equal(tabs[1].className,'is-home');assert.equal(tabs[1].getAttribute('aria-current'),'page');
// 조건을 다시 고르는 동안에는 탭을 숨긴다
t.api.S.view='q';t.api.freeSync();assert.equal(t.api.S.fnav.hidden,true);t.api.S.view='r';t.api.freeSync();

// 2. 정책자금·환급금: 전산 화면을 틀로 열고, 전산이 준비됐다고 알리면 조건과 이름·번호를 메시지로 건넨다
tabs[0].click();
assert.equal(t.api.S.frame.src,'https://go.irowoon.com/free#loans');assert.equal(t.api.S.fpane.hidden,false);
assert.equal(tabs[0].getAttribute('aria-current'),'page');assert.equal(tabs[1].getAttribute('aria-current'),null);
const frame=t.api.S.frame.contentWindow;
t.listeners.message({origin:'https://evil.invalid',source:frame,data:{type:'iroun-free-ready'}});
t.listeners.message({origin:'https://go.irowoon.com',source:{},data:{type:'iroun-free-ready'}});
assert.equal(t.posted.length,0,'다른 주소나 다른 창의 신호에는 아무것도 보내지 않는다');
t.listeners.message({origin:'https://go.irowoon.com',source:frame,data:{type:'iroun-free-ready'}});
assert.equal(t.posted.length,1);assert.equal(t.posted[0].origin,'https://go.irowoon.com');
const sent=JSON.parse(JSON.stringify(t.posted[0].msg));
assert.deepEqual(sent,{type:'iroun-free-member',tab:'loans',name:'검증대표',phone:'010-1234-5678',answers:{bizName:'가상분식',entity:'개인',industry:'음식점',province:'경기도',district:'시흥시',openedYear:2021,revNow:'1000~5000만원',revLast:'5000만원~1억',premises:'임차',policyFund:'X',credit:'700~750점',currentArrears:'X'},ref:'a'.repeat(64),delivery:'d'.repeat(22)});
// 다른 탭으로 옮기면 같은 틀에 탭만 알리고, 보고 있던 탭을 다시 누르면 처음 화면으로 돌린다
tabs[2].click();assert.deepEqual(JSON.parse(JSON.stringify(t.posted[1].msg)),{type:'iroun-free-tab',tab:'refunds',reset:false});
tabs[2].click();assert.deepEqual(JSON.parse(JSON.stringify(t.posted[2].msg)),{type:'iroun-free-tab',tab:'refunds',reset:true});
assert.equal(t.body.children.filter(c=>c===t.api.S.fpane)[0].children.length,1,'틀은 하나만 만든다');
// 홈: 틀을 닫고 결과 화면으로 돌아간다
tabs[1].click();assert.equal(t.api.S.fpane.hidden,true);assert.equal(tabs[1].getAttribute('aria-current'),'page');assert.equal(t.root.style.overflow,'');
// 실제 홈페이지에서는 시험용 주소를 쓸 수 없다
assert.equal(boot({answers:done,member,override:'https://evil.invalid'}).api.freeOrigin(),'https://go.irowoon.com');
assert.equal(boot({answers:done,member,override:'http://localhost:8802',host:'localhost'}).api.freeOrigin(),'http://localhost:8802');

// 3. 처음 안내: 정책자금 → 환급금 두 장을 차례로 확인해야 닫히고, 그 뒤에 이어서 할 일을 한다
const first=boot({answers:done,member});first.api.S.view='r';let opened=0;
first.api.freeIntro(()=>{opened++;});
const intro=first.api.S.fintro;
assert.equal(intro.hidden,false);assert.equal(opened,0,'확인 전에는 결과를 열지 않는다');
assert.match(intro.innerHTML,/1 \/ 2/);assert.match(intro.innerHTML,/저금리 융자지원금<br>예상 한도·금리를 <b>무료<\/b>로/);assert.match(intro.innerHTML,/role="alertdialog"/);
assert.equal(first.api.S.fnav.getAttribute('data-spot'),'loans');
first.api.freeOpen('loans');assert.equal(first.api.S.frame,undefined,'안내 중에는 전산 화면이 열리지 않는다');
intro.querySelector('.c2-fi-ok').click();
assert.match(intro.innerHTML,/2 \/ 2/);assert.match(intro.innerHTML,/통신환급도<br><b>최대 128만원<\/b> 현금으로/);
assert.equal(first.api.S.fnav.getAttribute('data-spot'),'refunds');assert.equal(opened,0);assert.equal(first.store.get('irw_free_intro'),undefined,'한 장만 확인해서는 끝나지 않는다');
intro.querySelector('.c2-fi-ok').click();
assert.equal(intro.hidden,true);assert.equal(opened,1);assert.equal(first.store.get('irw_free_intro'),'1');assert.equal(first.api.S.fnav.getAttribute('data-spot'),null);
// 이미 본 기기에서는 다시 띄우지 않고 바로 이어 간다
let again=0;first.api.freeIntro(()=>{again++;});assert.equal(again,1);assert.equal(intro.hidden,true);
// 무료 회원이 아니면 안내 없이 이어 간다
const guest=boot({answers:done});let passed=0;guest.api.freeIntro(()=>{passed++;});assert.equal(passed,1);assert.equal(guest.store.get('irw_free_intro'),undefined);

// 4. 이름·번호를 남긴 직후: 안내 두 장 뒤에 결과를 연다. 광고 수신을 고르든 안 고르든 같다.
assert.match(source,/S\.joinHelp=false;freeReset\(\);closeModal\(\);freeIntro\(function\(\)\{/);
assert.match(source,/toast\(esc\(name\)\+'님, 전체 결과가 열렸어요'\);\}\);\n \}catch\(e\)/);
// 조건을 다시 고르면 틀을 버려, 새 조건으로 다시 등록한 뒤에야 열린다
assert.match(source,/function analyzing\(\)\{stopTimers\(\);freeReset\(\);S\.member=null;/);

// 5. 한 번 조건을 설정한 기기에서는 다시 묻지 않고 결과부터 보여 준다(주소에 #result가 없어도)
assert.match(source,/\(async function init\(\)\{var back=hasProfile\(\)&&S\.ans\.done;if\(back\)\{S\.view='r';renderR\(\);\}else renderHome\(\);/);
assert.match(source,/ if\(back\)\{if\(S\.view==='r'&&S\.full&&modal\.hidden\)renderR\(\);\}else onList\(true\);\}\)\(\);/);
assert.ok(!source.includes("location.hash==='#result'"),'결과를 보려고 주소 표시를 붙일 필요가 없다');
console.log('PASS: free member tabs only after conditions and contact, order 정책자금·홈·환급금, framed CRM screens with message handshake, two required notices, result-first return visit');
