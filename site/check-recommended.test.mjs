// 추천사업(2026-11-22): 「신청 가능」을 「추천사업」으로 바꾸고, 사장님 본인이 받는 제도와 내 지역 지자체 사업을 추천에 넣는다.
// 마감됐거나 아직 접수 전인 사업은 추천에 보이지 않고, 새로 열리면 NEW 표시와 알림 줄이 뜬다.
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
const style=css(page);
assert.match(style,/\.doz_sys \.c2-total\.rec\{[^}]*animation:c2rec/,'추천사업 카드를 강조한다');
assert.match(style,/\.doz_sys \.c2-tag\.new\{background:#E5372B\}/);
assert.match(style,/prefers-reduced-motion:reduce\)\{\.doz_sys \.c2-total\.rec,\.doz_sys \.c2-star\{animation:none\}/,'움직임 줄이기 설정을 따른다');
assert.ok(!/font:[^;}]*inherit/.test(style),'font 줄임 속성에 inherit를 쓰지 않는다');

// ── 실제 함수를 가짜 화면에서 돌린다. 시계는 테스트가 정한다 ──
let clock=Date.parse('2026-11-22T12:00:00+09:00');
class FakeDate extends Date{constructor(...a){a.length?super(...a):super(clock);}static now(){return clock;}}
const day=86400000;
function boot(answers,member,store=new Map()){
 if(answers)store.set('irw_c2_ans',JSON.stringify(answers));if(member)store.set('irw_check_member',JSON.stringify(member));store.set('irw_free_intro','1');
 const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',value:'',hidden:key==='c2-modal',style:{},attrs:{},children:[],classList:{toggle(){},add(){},remove(){},contains:()=>false},setAttribute(){},getAttribute:()=>null,removeAttribute(){},appendChild(c){return c;},addEventListener(){},querySelector:s=>node(key+' '+s),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:10}),focus(){},parentNode:{scrollTop:0}});return nodes.get(key);};
 const context=vm.createContext({document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>node('new'+Math.random()),body:node('body'),documentElement:node('html')},
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},Date:FakeDate,URLSearchParams,location:{search:'',hash:'',hostname:'www.irowoon.com'},
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},console,fetch:()=>new Promise(()=>{}),navigator:{},window:{addEventListener(){},scrollTo(){}},innerHeight:800,scrollY:0,MutationObserver:class{observe(){}}});
 vm.runInContext(source.slice(0,source.indexOf('(async function init()'))+'globalThis.api={S,box,estimate,missed,profile,compute,renderR,renderList,homePool,customerMoney,recOk,sumOf,amountOf,subOf,row,sorted,pinned,localCare,recTrack,isFresh,freshCount,freshBar,recOpened,openDetail,moneyType,isClosed,notStarted};})();',context);
 return {api:context.api,store,node};
}
const base={kind:'지원금',audience:'사업',category:'경영',region:'전국',agency:'가상기관',sourceUrl:'https://www.example.go.kr',summary:'',support:'',checks:[],documents:[],startsAt:'',endsAt:'',checkedAt:'2026-11-22',budgetStatus:'해당 없음',status:'접수 중',rules:[]};
const standing=[
 {...base,id:'standing-eitc-late-2025',title:'근로장려금 기한 후 신청(2025년 소득분)',agency:'국세청',selection:'확정형',startsAt:'2026-06-02',endsAt:'2026-12-01',summary:'2025년에 사업소득이나 근로소득이 있었는데 5월 신청을 놓쳤다면 12월 1일까지 신청할 수 있어요.',support:'가구 구성에 따라 최대 330만 원(단독 165만·홑벌이 285만·맞벌이 330만 원, 기한 후 신청은 계산된 금액의 95%).'},
 {...base,id:'standing-child-credit-late-2025',title:'자녀장려금 기한 후 신청(2025년 소득분)',agency:'국세청',selection:'확정형',startsAt:'2026-06-02',endsAt:'2026-12-01',summary:'18세 미만 자녀가 있고 2025년 부부 합산 총소득이 7,000만 원 미만이면 자녀 1명당 100만 원까지 받아요.',support:'자녀 1명당 최대 100만 원(소득에 따라 50만 원부터, 기한 후 신청은 계산된 금액의 95%).'},
 {...base,id:'standing-eitc-2026',title:'근로장려금 정기 신청(2026년 소득분)',agency:'국세청',selection:'확정형',startsAt:'2027-05-01',endsAt:'2027-05-31',summary:'매년 5월에 신청해요.',support:'가구 구성과 소득에 따라 금액이 달라져요.'},
 {...base,id:'standing-efficient-appliance-2026',title:'소상공인 고효율기기 지원(냉난방기·냉장고 구입비 환급)',kind:'환급금',agency:'한국전력공사',selection:'확정형',startsAt:'2026-02-09',endsAt:'2026-12-31',budgetStatus:'확인 필요',summary:'2026년에 에너지효율 1등급 냉난방기·냉장고·세탁기·건조기를 사업장에 새로 들였다면 구입비(부가세 제외)의 40%를 돌려받아요.',support:'품목별로 최대 160만 원(냉난방기·냉장고 각 160만 원, 세탁기·건조기 각 80만 원).',documents:['중소기업확인서(소상공인)']},
 {...base,id:'standing-learning-card',title:'국민내일배움카드(사장님 직업훈련비)',agency:'고용노동부',selection:'확정형',status:'상시 조회',summary:'사업한 지 1년이 넘고 연매출 4억 원 미만인 사장님은 5년 동안 300만 원까지 직업훈련비를 지원받아요.',support:'5년간 최대 300만 원(요건이 맞으면 200만 원 추가). 과정에 따라 훈련비의 45~85%를 지원해요.',
  rules:[{scope:'business',field:'revenue',operator:'lte',value:399999999,label:'연매출 4억 원 미만'},{scope:'business',field:'openedAt',operator:'before',value:'2025-11-22T23:59:59+09:00',label:'사업한 지 1년 이상'}]},
];
const local=[
 {...base,id:'t-consult',title:'[경기] 시흥시 소상공인 경영컨설팅 지원',region:'경기도 시흥시',category:'멘토링ㆍ컨설팅ㆍ교육',summary:'시흥시 소상공인에게 전문가 경영컨설팅을 무료로 지원합니다.',openToAll:true},
 {...base,id:'t-marketing',title:'[경기] 소상공인 온라인 마케팅 지원',region:'경기도',category:'내수',summary:'경기도 소상공인의 온라인 홍보를 돕습니다.',openToAll:true},
 {...base,id:'t-other-region',title:'[부산] 소상공인 온라인 마케팅 지원',region:'부산광역시',category:'내수',summary:'부산 소상공인의 온라인 홍보를 돕습니다.',openToAll:true},
 {...base,id:'t-national-edu',title:'소상공인 온라인 마케팅 교육',category:'멘토링ㆍ컨설팅ㆍ교육',summary:'전국 소상공인 대상 무료 교육입니다.',openToAll:true},
 {...base,id:'t-closed',title:'[경기] 소상공인 경영환경개선 지원',region:'경기도',maxAmount:3000000,endsAt:'2026-10-31',status:'마감',summary:'점포 환경 개선비를 지원합니다.',openToAll:true},
 {...base,id:'t-upcoming',title:'[경기] 시흥시 소상공인 화재공제 가입 지원',region:'경기도 시흥시',maxAmount:200000,startsAt:'2026-12-10',endsAt:'2026-12-30',summary:'화재공제 가입비를 지원합니다.',openToAll:true},
 {...base,id:'t-cash',title:'[경기] 시흥시 소상공인 카드수수료 지원금',region:'경기도 시흥시',maxAmount:500000,endsAt:'2026-12-20',summary:'전년도 카드매출액의 0.5%를 지원합니다.',openToAll:true},
];
const year=2026;
const done={questionnaireVersion:2,revenueYear:year,done:true,bizName:'가상분식',entity:'개인',industry:'음식점',province:'경기도',district:'시흥시',openedYear:2021,employeeBand:'없음',revNow:'1000~5000만원',revLast:'5000만원~1억',premises:'임차',policyFund:'X',credit:'700~750점',currentArrears:'X'};
const member={name:'검증대표',tel:'010-1234-5678',at:'2026-11-21T00:00:00.000Z'};
const list=()=>structuredClone([...standing,...local]);
const ids=items=>items.map(x=>x.benefit.id).sort();

// 1. 조건을 설정하기 전의 목록에는 다른 지역의 지자체 컨설팅·마케팅 사업을 끌어오지 않는다
{
 const t=boot(null,null);t.api.S.list=list();
 const pool=ids(t.api.homePool());
 assert.ok(!pool.includes('t-consult')&&!pool.includes('t-marketing')&&!pool.includes('t-other-region'),'지역을 모르면 지자체 서비스 사업을 넣지 않는다');
 assert.ok(!pool.includes('t-closed')&&!pool.includes('t-upcoming')&&!pool.includes('standing-eitc-2026'),'마감·접수 전 사업은 보이지 않는다');
}

// 2. 추천사업: 사장님 본인 대상 제도와 내 지역 지자체 사업이 들어가고, 마감·접수 전·다른 지역은 빠진다
const t=boot(done,member);t.api.S.list=list();t.api.S.full=true;
t.api.compute();
const est=t.api.S.est,rec=ids(est.recItems);
for(const id of ['standing-eitc-late-2025','standing-child-credit-late-2025','standing-efficient-appliance-2026','standing-learning-card','t-consult','t-marketing','t-cash'])assert.ok(rec.includes(id),id+' 추천에 있다');
for(const id of ['t-other-region','t-national-edu','t-closed','t-upcoming','standing-eitc-2026'])assert.ok(!ids(est.items).includes(id),id+' 목록에 없다');
// 가구 소득·구입 여부를 모르는 제도는 합계에 더하지 않는다. 합계는 카드수수료 50만원뿐이다
assert.equal(est.recTotal,500000,'추천 합계에는 확인되지 않은 제도의 금액을 더하지 않는다');
assert.equal(est.total,500000);
const item=id=>est.items.find(x=>x.benefit.id===id);
assert.equal(t.api.amountOf(item('standing-eitc-late-2025').benefit),'최대 330만원');
assert.equal(t.api.amountOf(item('standing-child-credit-late-2025').benefit),'최대 100만원');
assert.equal(t.api.amountOf(item('standing-efficient-appliance-2026').benefit),'최대 160만원');
assert.equal(t.api.amountOf(item('standing-learning-card').benefit),'최대 300만원');
assert.match(t.api.subOf(item('standing-child-credit-late-2025'),false),/^18세 미만 자녀가 있으면 · 10일 남음$/);
assert.match(t.api.subOf(item('standing-eitc-late-2025'),false),/^소득·재산 기준이 맞으면 · /);
assert.match(t.api.subOf(item('standing-efficient-appliance-2026'),false),/^올해 1등급 기기를 샀다면 · /);
assert.equal(item('standing-eitc-late-2025').result,'추가 확인 필요','자격을 확정하지 않는다');
// 마감된 제도는 「놓친 지원금」에 자동으로 넣지 않는다(자격을 모르므로)
clock+=20*day;
{
 const later=boot(done,member);later.api.S.list=list();later.api.S.full=true;later.api.compute();
 assert.ok(!ids(later.api.S.est.items).includes('standing-eitc-late-2025'),'12월 1일이 지나면 추천에서 빠진다');
 assert.ok(!ids(later.api.S.pastAll.items).some(id=>id.startsWith('standing-eitc')||id.startsWith('standing-child')),'놓친 지원금으로 세지 않는다');
}
clock-=20*day;

// 3. 화면 문구: 「추천사업」과 강조, 처음 본 날에는 NEW 가 없다
t.api.renderR();
let html=t.api.box.innerHTML;
assert.match(html,/class="c2-total rec"[^>]*><div class="l"><i class="c2-star" aria-hidden="true">★<\/i>추천사업<span>7건<\/span>/);
assert.ok(html.includes('지금 신청할 수 있는 추천사업')&&!html.includes('신청 가능 지원금')&&!html.includes('지금 신청 가능한 지원금'));
assert.ok(!html.includes('c2-newbar')&&!html.includes('c2-tag new'),'처음 본 날에는 새것 표시가 없다');
assert.equal(t.api.freshCount(),0);
t.api.S.tab='now';t.api.renderList();
html=t.api.box.innerHTML;
assert.match(html,/data-tab="now">추천사업 7<\/button>/);assert.match(html,/data-fit="rec" class="on">추천 7<\/button>/);
assert.ok(html.includes('18세 미만 자녀가 있으면')&&html.includes('시흥시 소상공인 경영컨설팅 지원'));

// 4. 며칠 뒤 접수가 열린 사업은 그때 추천에 들어오고 NEW 와 알림 줄이 뜬다(같은 기기)
clock+=19*day; // 12월 11일: 화재공제 접수 시작, 근로·자녀장려금 기한 후 신청 마감
const again=boot(done,member,t.store);again.api.S.list=list();again.api.S.full=true;
again.api.renderR();
assert.ok(ids(again.api.S.est.recItems).includes('t-upcoming'),'접수가 열리면 추천에 들어온다');
assert.equal(again.api.freshCount(),1);assert.ok(again.api.isFresh('t-upcoming'));
html=again.api.box.innerHTML;
assert.match(html,/<button type="button" class="c2-newbar" data-list="now">.*새로 나온 추천사업 1건/);
again.api.S.tab='now';again.api.renderList();
html=again.api.box.innerHTML;
assert.match(html,/<span class="c2-tag new">NEW<\/span>\[경기\] 시흥시 소상공인 화재공제 가입 지원/);
assert.equal((html.match(/c2-tag new/g)||[]).length,1,'새로 들어온 것에만 붙는다');
assert.ok(html.indexOf('t-upcoming')<html.indexOf('t-cash'),'새로 나온 사업을 맨 위에 둔다');
// 다시 그려도 그대로이고, 눌러서 열어 보면 사라진다
again.api.renderR();assert.equal(again.api.freshCount(),1);
again.api.openDetail('t-upcoming');assert.equal(again.api.freshCount(),0);
const reopened=boot(done,member,again.store);reopened.api.S.list=list();reopened.api.S.full=true;reopened.api.renderR();
assert.equal(reopened.api.freshCount(),0,'열어 본 사업은 다음에 와도 새것이 아니다');

// 5. 열어 보지 않아도 7일이 지나면 NEW 가 사라진다
{
 const store=new Map();clock=Date.parse('2026-11-22T12:00:00+09:00');
 let v=boot(done,member,store);v.api.S.list=list();v.api.S.full=true;v.api.compute();
 clock+=19*day;v=boot(done,member,store);v.api.S.list=list();v.api.S.full=true;v.api.compute();assert.equal(v.api.freshCount(),1);
 clock+=6*day;v=boot(done,member,store);v.api.S.list=list();v.api.S.full=true;v.api.compute();assert.equal(v.api.freshCount(),1,'6일째에는 남아 있다');
 clock+=2*day;v=boot(done,member,store);v.api.S.list=list();v.api.S.full=true;v.api.compute();assert.equal(v.api.freshCount(),0,'7일이 지나면 사라진다');
 // 6. 조건을 바꾸면 처음부터 다시 센다(전부 처음 보는 목록이라 표시하지 않는다)
 v=boot({...done,district:'부천시'},member,store);v.api.S.list=list();v.api.S.full=true;v.api.compute();
 assert.equal(v.api.freshCount(),0);assert.ok(!ids(v.api.S.est.items).includes('t-consult'),'다른 시의 사업은 보이지 않는다');
 assert.ok(ids(v.api.S.est.recItems).includes('t-marketing'),'같은 도의 사업은 보인다');
}

// 7. 가입 전(잠금) 화면도 같은 이름을 쓴다
{
 clock=Date.parse('2026-11-22T12:00:00+09:00');
 const guest=boot(done,null);guest.api.S.list=list();guest.api.S.full=true;guest.api.renderR();
 const h=guest.api.box.innerHTML;
 assert.ok(h.includes('</span>추천사업</div>')&&!h.includes('받을 수 있는 지원금'));
}
console.log('PASS: recommended programs — owner benefits and local programs included, unknown amounts kept out of totals, closed and upcoming hidden, new arrivals flagged');
