import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./check-v2.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);
// Exercise the actual form functions in an isolated, network-free page adapter.
function form(draft={}){
 const storage=new Map([['irw_c2_ans',JSON.stringify(draft)]]),nodes=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',value:'',style:{},querySelector:s=>node(s),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:10}),focus(){}});return nodes.get(key);};
 let sent;
 const context=vm.createContext({document:{getElementById:node,querySelector:()=>null,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Date,URLSearchParams,innerHeight:900,clearTimeout(){},clearInterval(){},fetch:async(url,init)=>{sent=JSON.parse(init.body);return {};}});
 const stop=source.indexOf('(async function init()');
 vm.runInContext(source.slice(0,stop)+'globalThis.form={S,YEAR,steps,Qdef,renderQ,profile,evalRule,matchBenefit,joinText,sendLead,REV};})();',context);
 return {api:context.form,node,sent:()=>sent};
}
const legacy=form({done:true,bizName:'가상식당',openedYear:2020,openedMonth:'7월',woman:'예',employeeBand:'1~4명',loans:['은행'],revNow:'1억~3억 원',credit:'800~899점'});
assert.equal(legacy.api.S.ans.done,false);assert.equal(legacy.api.S.ans.bizName,'가상식당');
for(const key of ['openedMonth','woman','employeeBand','loans','credit','revNow'])assert.equal(legacy.api.S.ans[key],undefined);
const f=form(),a=f.api;Object.assign(a.S.ans,{bizName:'가상식당',entity:'개인',industry:'음식점',province:'서울특별시',district:'마포구',openedYear:a.YEAR-2,revNow:'1000~5000만원',revLast:'2억 이상',premises:'임차',credit:'700~750점',currentArrears:'O'});
assert.equal(a.steps()[0],'bizName');assert.equal(a.steps().length,12);assert.ok(a.steps().indexOf('policyFund')>a.steps().indexOf('premises'));assert.deepEqual(Array.from(a.Qdef('policyFund').opts),['O','X']);
for(const k of ['woman','employeeBand','loans','bad'])assert.ok(!a.steps().includes(k));
assert.deepEqual(Array.from(a.Qdef('revNow').opts),['1000만원 미만','1000~5000만원','5000만원~1억','1억~2억','2억 이상']);
assert.deepEqual(Array.from(a.Qdef('revLast').opts),Array.from(a.Qdef('revNow').opts));
assert.equal(a.Qdef('credit').opts.length,4);assert.deepEqual(Array.from(a.Qdef('currentArrears').opts),['O','X']);
for(const [i,k] of a.steps().entries()){a.S.idx=i;a.renderQ();const h=f.node('chk2').innerHTML;assert.ok(h.includes((i+1)+'/12'));assert.ok(!h.includes('c2-om'));}
const biz=a.profile().businesses[0];for(const k of ['womanOwned','employeeBand','arrears','delinquency'])assert.equal(biz[k],undefined);
const rule={scope:'business',field:'revenue',operator:'lte',value:3e8};assert.equal(a.evalRule(rule,biz,a.profile(),a.YEAR),undefined,'2억 이상을 3억 이하로 확정하지 않음');
const summary=a.joinText(false);assert.ok(summary.includes('현재 연체 또는 세금 체납: O'));assert.ok(!/여성 대표:|4대보험 직원:|기대출:/.test(summary));
a.sendLead('가상대표','01055550099',false);const payload=f.sent();assert.equal(payload.questionnaireVersion,2);assert.equal(payload.creditBand,'700~750점');assert.equal(payload.currentArrears,'O');assert.equal(payload.revenueYear,a.YEAR);assert.deepEqual(payload.loans,[]);assert.equal(payload.employeeBand,undefined);
a.S.ans.openedYear=a.YEAR;assert.ok(!a.steps().includes('revLast'));
console.log('PASS: 12-step(정책자금 O·X 포함) questionnaire, year-only, five revenue/four credit bands, O/X, draft migration, unknowns and exact CRM payload');
