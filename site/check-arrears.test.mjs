import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// 현재 연체·체납 X 답변은 '현재 국세·지방세 체납 / 현재 연체' 확인 사항만 해결하고, 섞인 조건은 남긴다
const html=fs.readFileSync(new URL('./check-v2.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const node=()=>({innerHTML:'',value:'',style:{},querySelector:()=>node(),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:10}),focus(){}});
const ctx=vm.createContext({document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},Date,URLSearchParams,innerHeight:900,clearTimeout(){},clearInterval(){},setTimeout(){},fetch:async()=>({})});
vm.runInContext(source.slice(0,source.indexOf('(async function init()'))+'globalThis.T={matchBenefit,S,profile};})();',ctx);
const {matchBenefit,S,profile}=ctx.T;
const base={title:'시험 지원',region:'전국',status:'접수 중',rules:[],openToAll:true};
const run=(checks,ar)=>{S.ans={entity:'개인',industry:'음식점',province:'경기도',currentArrears:ar};return matchBenefit(Object.assign({},base,{checks}),profile());};
let m=run(['국세·지방세 체납이 없는 사업자'],'X');assert.equal(m.unknowns.length,0);assert.equal(m.result,'조건 일치');
m=run(['현재 금융기관 연체 중인 자 제외'],'X');assert.equal(m.unknowns.length,0);
m=run(['국세·지방세 및 4대보험 체납이 없는 자'],'X');assert.equal(m.unknowns.length,1,'4대보험이 섞이면 남김');
m=run(['최근 3년 이내 보증사고 이력이 없는 자'],'X');assert.equal(m.unknowns.length,1,'보증사고 이력은 X로 해결하지 않음');
m=run(['국세·지방세 체납이 없는 사업자'],'O');assert.ok(m.unknowns.length>=1);assert.notEqual(m.result,'조건 일치');
m=run(['국세·지방세 체납이 없는 사업자'],undefined);assert.equal(m.unknowns.length,1);
console.log('PASS: X는 현재 국세·지방세 체납/현재 연체만 해결, 4대보험·보증사고·이력 섞인 조건과 O·미답변은 남김');
