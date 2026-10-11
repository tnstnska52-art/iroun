import {beforeAll,beforeEach,afterAll,afterEach,describe,it,expect,vi} from "vitest";
import express from "express";
import request from "supertest";
import {pool} from "@workspace/db";
import {randomUUID,createHmac} from "node:crypto";
vi.mock("@clerk/express",()=>({getAuth:(r:any)=>({userId:r.get("x-test-user")||null}),clerkClient:{users:{getUser:vi.fn(),deleteUser:vi.fn()}}}));
import {createCompanyRouter} from "./company";
import {eraseAccount} from "./benefits";
import {account} from "../lib/benefit-store";
import {deliverDeadlines,registerDevice,expoTransport} from "../lib/push-delivery";
import {CONSENT_VERSION,finished,historicalMatch,validPhone,validKakao} from "../lib/company-domain";
import {type Benefit} from "../lib/benefit-domain";
const suffix=randomUUID(),owner=`qa-co-${suffix}`,other=`qa-other-co-${suffix}`,admin=`qa-admin-co-${suffix}`,s1=`qa-staff1-co-${suffix}`,s2=`qa-staff2-co-${suffix}`;
const ids=[owner,other,admin,s1,s2],email=`${suffix}@example.test`,bId=`qa-company-notice-${suffix}`,oldId=`qa-company-past-${suffix}`;
const secret="unit-company-identity-placeholder";
let b:Benefit,old:Benefit;
const profile={personal:{province:"부산",district:"해운대구",birthYear:1960},businesses:[{id:"biz",province:"경남",district:"김해시",industry:"음식점"}],step:2};
const prefs={privacyConsent:true,accountConsent:true,termsConsent:true,notifications:true,personalizedAlerts:true,largeText:false};
const base:Benefit={id:bId,title:"시험 장비 지원",category:"시설",kind:"지원금",audience:"사업",region:"경남 김해시",agency:"시험자료",sourceId:bId,sourceUrl:"https://www.bizinfo.go.kr/",summary:"시험용",support:"원문 확인",calculation:"현금 금액 없음",checks:[],documents:["사업자등록증"],startsAt:"2026-01-01",endsAt:"2099-12-31",checkedAt:"2026-01-01T00:00:00Z",budgetStatus:"해당 없음",status:"접수 중",reviewStatus:"공개",isTest:false,rules:[{scope:"business",field:"industry",operator:"eq",value:"음식점",label:"업종"}]};
function app(){const a=express();a.use(express.json());a.use(createCompanyRouter({notices:async()=>[b,old],identity:async()=>email}));return a;}
const get=(path:string,user=owner)=>request(app()).get(path).set("x-test-user",user);
const post=(path:string,body:any,user=owner)=>request(app()).post(path).set("x-test-user",user).send(body);
const put=(path:string,body:any,user=admin)=>request(app()).put(path).set("x-test-user",user).send(body);
const trial=()=>post("/service/trial",{});
const apply=(kind="신청 지원",extra:any={})=>post("/service/requests",{benefitId:bId,businessId:"biz",kind,confirmed:true,...extra});
// 회사 신청 도움은 계약 고객만 요청할 수 있으므로, 접수 시험에서는 계약 기록을 함께 만든다.
async function signed(user=owner){await pool.query("INSERT INTO iroun_contracts(id,user_id,starts_at,ends_at,reason,evidence,actor) VALUES($1,$2,now()-interval '1 day',now()+interval '30 days','시험 계약','시험',$3)",[randomUUID(),user,admin]);}
// 이용 종료 시험: 이용권과 계약을 함께 회수한다.
async function revokeAll(user=owner){await pool.query("UPDATE iroun_grants SET revoked_at=now() WHERE user_id=$1",[user]);await pool.query("UPDATE iroun_contracts SET revoked_at=now() WHERE user_id=$1",[user]);}
async function gift(user=owner){await signed(user);await pool.query("INSERT INTO iroun_grants(user_id,expires_at,reason,granted_by) VALUES($1,now()+interval '1 day','시험용', $2) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=NULL",[user,admin]);}
async function code(user=owner){return (await post("/service/owner-code",{},user)).body.code;}
async function contract(extra:any={}){return post("/office/contracts",{accountCode:await code(),startsAt:"2026-01-01T00:00:00+09:00",endsAt:"2099-01-01T00:00:00+09:00",reason:"시험 계약 기록",evidence:"시험 본인 계정 연결",...extra},admin);}
async function employee(id=s1){return post("/office/staff",{userId:id,name:"시험 직원",phone:"",kakao:"",enabled:true},admin);}
const update=(assignedTo:string|null,extra:any={})=>({assignedTo,state:"자료 준비",customerTasks:["서류 준비"],staffTasks:["원문 확인"],completedTasks:[],internalNote:"직원 전용 시험 메모",...extra});
async function assigned(){await gift();const r=await apply();await employee();await employee(s2);await put(`/office/requests/${r.body.id}`,update(s1));return r.body.id as string;}
describe("이번 API 보완 신규 푸시 권한 모의검사",()=>{
 function realTestScope(){
  vi.stubEnv("IROUN_PUSH_SEND_ENABLED","true");
  vi.stubEnv("IROUN_PUSH_TEST_CONSENT_CONFIRMED","true");
  vi.stubEnv("IROUN_PUSH_TEST_USER_ID",owner);
  vi.stubEnv("IROUN_PUSH_TEST_BENEFIT_ID",bId);
  // Mock only HTTP: exercise the real provider adapter and DB authorization.
  return vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({data:[{status:"ok",id:`mock-real-path-${suffix}`}]}),{status:200}));
 }
 it("실제 전송 경로도 지정 시험 계정·시험 공고로만 제한 (HTTP 모의)",async()=>{
  await gift();await gift(other);
  await registerDevice(owner,`ExpoPushToken[scope_${suffix.replaceAll("-","")}]`);
  await registerDevice(other,`ExpoPushToken[other_${suffix.replaceAll("-","")}]`);
  const http=realTestScope();
  expect((await deliverDeadlines(expoTransport,undefined,Date.now(),"personalized")).accepted).toBe(1);
  expect(http).toHaveBeenCalledTimes(1);
  const messages=JSON.parse(String(http.mock.calls[0][1]?.body));
  expect(messages).toHaveLength(1);
  expect(messages[0].data).toEqual({benefitId:bId});
  expect(messages[0].channelId).toBe("deadline");
  expect(messages[0].to).toContain("scope_");
  const jobs=(await pool.query("SELECT user_id,benefit_id,status FROM iroun_push_jobs WHERE user_id=ANY($1::text[])",[ids])).rows;
  expect(jobs).toEqual([{user_id:owner,benefit_id:bId,status:"provider_accepted"}]);
 });
 it("실제 전송 경로의 마감 시험도 지정 시험 공고만 접수 (HTTP 모의)",async()=>{
  await gift();
  const endsAt=new Date(Date.now()+86400000).toISOString();
  await pool.query("UPDATE iroun_benefits SET data=jsonb_set(data,'{endsAt}',to_jsonb($2::text)) WHERE id=$1",[bId,endsAt]);
  try{
   await pool.query("INSERT INTO iroun_tracking(user_id,benefit_id,data) VALUES($1,$2,$3)",[owner,bId,JSON.stringify({deadlineReminder:true})]);
   await registerDevice(owner,`ExpoPushToken[scope_${suffix.replaceAll("-","")}]`);
   const http=realTestScope();
   expect((await deliverDeadlines()).accepted).toBe(1);
   expect(http).toHaveBeenCalledTimes(1);
   expect(JSON.parse(String(http.mock.calls[0][1]?.body))[0].data.benefitId).toBe(bId);
  }finally{
   await pool.query("UPDATE iroun_benefits SET data=jsonb_set(data,'{endsAt}',to_jsonb($2::text)) WHERE id=$1",[bId,base.endsAt]);
  }
 });
 it("시험 범위여도 운영 공고 후보는 발송 차단 (DB·HTTP 모의)",async()=>{
  await gift();
  await registerDevice(owner,`ExpoPushToken[scope_${suffix.replaceAll("-","")}]`);
  const http=realTestScope();
  // Never make a fixture visible in the live development catalog.
  vi.spyOn(pool,"query").mockResolvedValueOnce({rows:[{user_id:owner,benefit_id:bId,benefit:{...base,isTest:false},revision:new Date()}]} as any);
  expect((await deliverDeadlines(expoTransport,undefined,Date.now(),"personalized")).accepted).toBe(0);
  expect(http).not.toHaveBeenCalled();
 });
 async function dispatch(){
  await registerDevice(owner,`ExpoPushToken[qa_${suffix.replaceAll("-","")}]`);
  const send=vi.fn(async()=>[{status:"ok" as const,id:`mock-ticket-${suffix}`}]);
  const result=await deliverDeadlines({send},owner,Date.now(),"personalized");
  return {send,result};
 }
 it("신규 푸시 무료 권한 차단",async()=>{const {send}=await dispatch();expect(send).not.toHaveBeenCalled();});
 it("신규 푸시 유효 체험 허용",async()=>{await trial();const {send,result}=await dispatch();expect(result.accepted).toBeGreaterThan(0);expect(send).toHaveBeenCalled();});
 it("신규 푸시 유효 계약 허용",async()=>{await contract();const {send,result}=await dispatch();expect(result.accepted).toBeGreaterThan(0);expect(send).toHaveBeenCalled();});
 it("신규 푸시 체험 만료 차단",async()=>{await trial();await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[owner]);const {send}=await dispatch();expect(send).not.toHaveBeenCalled();});
 it("신규 푸시 체험 만료 후 유효 계약 유지",async()=>{await trial();await contract();await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[owner]);expect((await dispatch()).result.accepted).toBeGreaterThan(0);});
 it("신규 푸시 계약 회수 차단",async()=>{const c=await contract();await contract({id:c.body.id,revoke:true});expect((await dispatch()).send).not.toHaveBeenCalled();});
 it("신규 푸시 필수 서비스 동의 철회 차단",async()=>{await contract();await post("/service/consents",{kind:"service",accepted:false,version:CONSENT_VERSION});expect((await dispatch()).send).not.toHaveBeenCalled();});
});
beforeAll(async()=>{
 for(const id of ids)await pool.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING",[id]);
 for(const n of [base,{...base,id:oldId,sourceId:oldId}])await pool.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$1,$2) ON CONFLICT DO NOTHING",[n.id,JSON.stringify({...n,isTest:true})]); // Never publicly exposed.
});
beforeEach(async()=>{
 vi.stubEnv("SESSION_SECRET",secret);b={...base,rules:[...base.rules]};old={...base,id:oldId,sourceId:oldId,status:"마감",startsAt:"2026-01-01",endsAt:"2026-02-01"};
 await pool.query("UPDATE iroun_service_requests SET assigned_to=NULL WHERE user_id=ANY($1::text[])",[ids]);
 await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])",[ids]);
 for(const id of ids)await pool.query("INSERT INTO iroun_accounts(id,role,profile,preferences) VALUES($1,$2,$3,$4)",[id,id===admin?"admin":"customer",JSON.stringify(profile),JSON.stringify(prefs)]);
 for(const id of [owner,other])await pool.query("INSERT INTO iroun_consents(user_id,kind,version,content,accepted) VALUES($1,'service',$2,'시험 동의문',true)",[id,CONSENT_VERSION]);
 await pool.query("DELETE FROM iroun_trial_ledger WHERE identity_hash=$1",[createHmac("sha256",secret).update("trial-email:"+email).digest("hex")]);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
afterAll(async()=>{
 await pool.query("UPDATE iroun_service_requests SET assigned_to=NULL WHERE user_id=ANY($1::text[])",[ids]);
 await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])",[ids]);
 await pool.query("DELETE FROM iroun_benefits WHERE id=ANY($1::text[])",[[bId,oldId]]);
 await pool.query("DELETE FROM iroun_audit WHERE actor=ANY($1::text[]) OR subject=ANY($1::text[])",[ids]);
 await pool.query("DELETE FROM iroun_deletions WHERE user_id=ANY($1::text[])",[ids]);
 await pool.query("DELETE FROM iroun_trial_ledger WHERE identity_hash=$1",[createHmac("sha256",secret).update("trial-email:"+email).digest("hex")]);
});
describe("신규 체험·동의·계약 (실제 개발DB/모의 인증)",()=>{
 it("비회원은 개인 서비스 401",async()=>expect((await request(app()).get("/service/state")).status).toBe(401));
 it("무료 맞춤 차단·문의 유지",async()=>{expect((await get("/service/matches")).status).toBe(403);expect((await get("/service/state")).status).toBe(200);});
 it("명시적 체험 시작은 정확히 연속72시간",async()=>{expect((await trial()).status).toBe(200);const a=await account(owner);expect(a.entitlement.trialActive).toBe(true);expect(Date.parse(a.entitlement.trialUntil!)-Date.parse(a.entitlement.trialStartedAt!)).toBe(72*3600000);});
 it("체험 재시작·재로그인·프로필변경으로 연장불가",async()=>{await trial();const first=(await account(owner)).entitlement.trialUntil;expect((await trial()).status).toBe(409);expect((await account(owner)).entitlement.trialUntil).toBe(first);});
 it("고객 전송 종료시각 무시 아닌 거부",async()=>expect((await post("/service/trial",{endsAt:"2099-01-01"})).status).toBe(400));
 it("서버 시간 기준: Date.now 변경은 체험 연장불가",async()=>{await trial();const end=(await account(owner)).entitlement.trialUntil;vi.spyOn(Date,"now").mockReturnValue(Date.now()+100*86400000);expect((await account(owner)).entitlement.trialUntil).toBe(end);expect((await account(owner)).entitlement.trialActive).toBe(true);});
 it("72시간 직전 허용",async()=>{await trial();await pool.query("UPDATE iroun_trials SET ends_at=now()+interval '1 second' WHERE user_id=$1",[owner]);expect((await get("/service/matches")).status).toBe(200);});
 it("72시간 종료 뒤 맞춤 차단",async()=>{await trial();await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 second' WHERE user_id=$1",[owner]);expect((await get("/service/matches")).status).toBe(403);expect((await trial()).status).toBe(409);});
 it("검증 이메일 재가입에도 체험중복 차단",async()=>{await trial();expect((await post("/service/trial",{},other)).status).toBe(409);});
 it("마케팅 거절·푸시거절도 체험허용",async()=>{await post("/service/consents",{kind:"marketing",accepted:false,version:CONSENT_VERSION});await pool.query("UPDATE iroun_accounts SET preferences=preferences||'{\"notifications\":false,\"personalizedAlerts\":false}' WHERE id=$1",[owner]);expect((await trial()).status).toBe(200);});
 it("최소정보 없음 체험409",async()=>{await pool.query("UPDATE iroun_accounts SET profile='{\"personal\":{},\"businesses\":[],\"step\":0}' WHERE id=$1",[owner]);expect((await trial()).status).toBe(409);});
 it("모름으로 첫질문 진행하면 체험허용",async()=>{await pool.query("UPDATE iroun_accounts SET profile='{\"personal\":{},\"businesses\":[],\"step\":1}' WHERE id=$1",[owner]);expect((await trial()).status).toBe(200);});
 it("필수서비스 동의 철회는 기존권한에도 적용",async()=>{await gift();await post("/service/consents",{kind:"service",accepted:false,version:CONSENT_VERSION});expect((await get("/service/matches")).status).toBe(403);const s=(await get("/service/state")).body;expect(s.consents[0].accepted).toBe(false);expect(s.consents[0].content).toBeTruthy();});
 it("동의 버전 임의값 거부",async()=>expect((await post("/service/consents",{kind:"service",accepted:true,version:"fake"})).status).toBe(400));
 it("최신 서비스 동의 없이 체험 시작 금지",async()=>{await pool.query("DELETE FROM iroun_consents WHERE user_id=$1",[owner]);expect((await trial()).status).toBe(409);});
 it("무료 기존 계정→계약, 체험없이 이용",async()=>{expect((await contract()).status).toBe(200);const a=await account(owner);expect(a.entitlement.contractActive).toBe(true);expect(a.entitlement.trialActive).toBe(false);});
 it("고객은 스스로 계약을 만들 수 없음",async()=>expect((await post("/office/contracts",{})).status).toBe(403));
 it("이름만으로 계약 연결 금지",async()=>expect((await contract({accountCode:undefined,userId:owner})).status).toBe(400));
 it("다른계정 ID와 연결번호 충돌 거부",async()=>expect((await contract({userId:other})).status).toBe(409));
 it("연결번호 한번사용·만료 차단",async()=>{const c=await code();expect((await contract({accountCode:c})).status).toBe(200);expect((await contract({accountCode:c})).status).toBe(409);});
 it("계약기간중 체험종료는 접근 유지",async()=>{await trial();await contract();await pool.query("UPDATE iroun_trials SET ends_at=now()-interval '1 hour' WHERE user_id=$1",[owner]);expect((await account(owner)).entitlement.active).toBe(true);});
 it("계약회수에도 유효체험 유지",async()=>{await trial();const c=await contract();await contract({id:c.body.id,revoke:true});expect((await account(owner)).entitlement.active).toBe(true);});
 it("복수계약 중 한쪽회수는 다른권한 유지",async()=>{const c=await contract();await contract();await contract({id:c.body.id,revoke:true});expect((await account(owner)).entitlement.contractActive).toBe(true);});
 it("미래 시작 계약은 지금 활성화되지 않음",async()=>{await contract({startsAt:"2098-01-01T00:00:00Z"});expect((await account(owner)).entitlement.active).toBe(false);});
 it("만료계약·무상권 독립 유지",async()=>{await gift();await contract({startsAt:"2020-01-01T00:00:00Z",endsAt:"2021-01-01T00:00:00Z"});expect((await account(owner)).entitlement.active).toBe(true);});
});
describe("신규 회사 접수·담당자·문의·알림",()=>{
 it("현재/지난 분리·과거조건 참고 표시",async()=>{await gift();const current=(await get("/service/matches")).body.items;const past=(await get("/service/matches?period=past&year=2026")).body.items;expect(current).toHaveLength(1);expect(past).toHaveLength(1);expect(past[0].matches[0].result).toBe("추가 확인 필요");expect(past[0].closed).toBe(true);});
 it("어제 확인한 상시공고는 마감아님",()=>expect(finished({...base,endsAt:"",status:"상시 조회",checkedAt:"2026-01-01T00:00:00Z"})).toBe(false));
 it("예산소진·공식 종료는 마감",()=>{expect(finished({...base,budgetStatus:"소진"})).toBe(true);expect(finished({...base,status:"마감"})).toBe(true);});
 it("과거 비교는 당시 나이와 확인필요 표시",()=>{const r=historicalMatch({...base,startsAt:"2020-01-01",rules:[{scope:"personal",field:"age",operator:"gte",value:65,label:"연령"}]},profile)[0];expect(r.referenceYear).toBe(2020);expect(r.result).toBe("추가 확인 필요");});
 it("무료 신청지원 요청 403",async()=>expect((await apply()).status).toBe(403));
 it("월 구독자는 맞춤 이용은 되지만 회사 신청지원은 요청 불가(패키지 계약 고객만)",async()=>{
  await pool.query("INSERT INTO iroun_subscriptions(user_id,expires_at,state,provider,provider_id) VALUES($1,now()+interval '30 days','active','test',$2)",[owner,`qa-sub-${suffix}`]);
  await post("/service/consents",{kind:"service",accepted:true,version:CONSENT_VERSION});
  const state=(await get("/service/state")).body;expect(state.account.entitlement.subscriptionActive).toBe(true);expect(state.account.entitlement.contractActive).toBe(false);
  expect((await get("/service/matches")).status).toBe(200);
  const r=await apply();expect(r.status).toBe(403);expect(r.body.error).toContain("계약 고객");
  await signed();expect((await apply()).status).toBe(200);
 });
 it("체험 회원은 신청지원 요청 불가(계약 고객만)",async()=>{await trial();const r=await apply();expect(r.status).toBe(403);expect(r.body.error).toContain("계약 고객");await signed();expect((await apply()).status).toBe(200);});
 it("조건일치·고객확인→회사 실제접수",async()=>{await gift();const r=await apply();expect(r.status).toBe(200);const state=(await get("/service/state")).body;expect(state.requests[0].state).toBe("회사 접수");expect(state.requests[0].snapshot.warning).toContain("기관");});
 it("불일치 이유 반환·자격문의 가능",async()=>{await gift();b.rules=[{...base.rules[0],value:"제조업"}];const r=await apply();expect(r.status).toBe(409);expect(r.body.detail.exclusions[0]).toContain("업종");expect((await apply("자격 확인")).status).toBe(200);});
 it("미확인 조건은 불가 아닌 자격문의",async()=>{await gift();b.checks=["중복수혜 확인 필요"];expect((await apply()).status).toBe(409);expect((await apply("자격 확인")).status).toBe(200);});
 it("미확인 중복수혜는 확인필요",async()=>{await gift();b.rules=[{scope:"personal",field:"duplicateBenefit",operator:"eq",value:"없음",label:"중복수혜"}];expect((await apply()).body.detail.unknowns.join(" ")).toContain("중복수혜");});
 it("사업 상황도 사업장별 실제 조건 비교",async()=>{await gift();await pool.query("UPDATE iroun_accounts SET profile=jsonb_set(profile,'{businesses,0,situation}','\"운영 중\"') WHERE id=$1",[owner]);b.rules=[{scope:"business",field:"situation",operator:"eq",value:"운영 중",label:"사업 상황"}];expect((await get("/service/matches")).body.items[0].matches[0].result).toBe("조건 일치");});
 it("자격 확인 후 일치하면 기존 접수를 신청 지원으로 전환",async()=>{await gift();const original=b.rules;b.rules=[{scope:"personal",field:"age",operator:"gte",value:90,label:"나이"}];const first=await apply("자격 확인");b.rules=original;const next=await apply();expect(next.status).toBe(200);expect(next.body.id).toBe(first.body.id);const rows=(await get("/service/state")).body.requests;expect(rows).toHaveLength(1);expect(rows[0].kind).toBe("신청 지원");expect(rows[0].snapshot.decision.result).toBe("조건 일치");});
 it("마감·소진은 신청 불가",async()=>{await gift();b.status="마감";expect((await apply()).status).toBe(409);});
 it("고객 확인 없이는 접수불가",async()=>{await gift();expect((await apply("신청 지원",{confirmed:false})).status).toBe(400);});
 it("중복클릭·재시도 접수1건",async()=>{await gift();const rs=await Promise.all([apply(),apply(),apply()]);expect(rs.map(r=>r.status)).toEqual([200,200,200]);expect(new Set(rs.map(r=>r.body.id)).size).toBe(1);});
 it("저장실패는500·롤백, 재시도 정상접수",async()=>{
  await gift();const original=pool.connect.bind(pool);const spy=vi.spyOn(pool,"connect").mockImplementation(((cb?:any)=>{
   if(cb)return original(cb);
   return original().then(c=>{const q=c.query.bind(c),release=c.release.bind(c);c.query=((text:any,...args:any[])=>{if(typeof text==="string"&&text.startsWith("INSERT INTO iroun_service_requests"))throw new Error("시험 저장 실패");return (q as any)(text,...args);}) as any;c.release=(...args:any[])=>{c.query=q as any;c.release=release;(release as any)(...args);};return c;});
  }) as any);
  const r=await apply();expect(r.status).toBe(500);spy.mockRestore();expect((await get("/service/state")).body.requests).toHaveLength(0);expect((await apply()).status).toBe(200);
 });
 it("재배정 후 이전 담당자의 고객·접수·문의 접근 회수",async()=>{const id=await assigned();expect((await get("/office/state",s1)).body.requests).toHaveLength(1);await put(`/office/requests/${id}`,update(s2));expect((await get("/office/state",s1)).body.requests).toHaveLength(0);expect((await get(`/office/customers/${owner}/matches`,s1)).status).toBe(403);});
 it("직원은 본인 배정만·고객 내부메모 노출없음",async()=>{await assigned();expect((await get("/office/state",s2)).body.requests).toHaveLength(0);expect(JSON.stringify((await get("/service/state")).body.requests)).not.toContain("직원 전용");});
 it("직원은 계약·배정·회사연락처 관리 금지",async()=>{const id=await assigned();expect((await post("/office/contracts",{},s1)).status).toBe(403);expect((await put(`/office/requests/${id}`,update(s2),s1)).status).toBe(403);expect((await put("/office/settings",{phone:"",kakao:"",website:""},s1)).status).toBe(403);});
 it("직원 비활성 즉시 접근차단",async()=>{await assigned();await post("/office/staff",{userId:s1,name:"시험 직원",phone:"",kakao:"",enabled:false},admin);expect((await get("/office/state",s1)).status).toBe(403);});
 it("미등록 연락처는빈값·잘못된 입력 거부",async()=>{expect(validPhone("123")).toBe(false);expect(validKakao("https://evil.test")).toBe(false);expect((await put("/office/settings",{phone:"123",kakao:"",website:""})).status).toBe(400);});
 it("카카오 링크 유효범위·회사 웹주소 검증",async()=>{expect(validKakao("https://open.kakao.com/o/test123")).toBe(true);expect((await put("/office/settings",{phone:"",kakao:"",website:"not-url"})).status).toBe(400);});
 it("앱/웹 같은계정 문의 저장·중복 재시도·타인격리",async()=>{const input={title:"시험 문의",body:"회사 자격 확인",requestKey:"qa-retry-123"};const a=await post("/service/inquiries",input);const b=await post("/service/inquiries",input);expect(a.body.id).toBe(b.body.id);expect((await get("/service/state",other)).body.inquiries).toHaveLength(0);});
 it("체험 만료 뒤 문의·권리행사 유지",async()=>{await post("/service/inquiries",{title:"삭제 문의",body:"개인정보 권리",requestKey:"qa-rights-123"});expect((await get("/service/state")).body.inquiries).toHaveLength(1);});
 it("관리자 답변·처리상태 실제 저장",async()=>{const q=await post("/service/inquiries",{title:"시험",body:"문의",requestKey:"qa-reply-123"});expect((await post(`/office/inquiries/${q.body.id}/reply`,{body:"확인 후 안내합니다.",state:"답변 완료"},admin)).status).toBe(200);expect((await get("/service/state")).body.inquiries[0].replies).toHaveLength(1);});
 it("다른 직원은 문의답변 불가",async()=>{await assigned();const q=await post("/service/inquiries",{title:"시험",body:"문의",requestKey:"qa-reply-123"});expect((await post(`/office/inquiries/${q.body.id}/reply`,{body:"시험",state:"확인 중"},s2)).status).toBe(403);});
 it("앱내 알림중복 방지·만료후 숨김·구링크차단",async()=>{await gift();const a=(await get("/service/state")).body.inbox;expect(a).toHaveLength(1);expect((await get("/service/state")).body.inbox).toHaveLength(1);await revokeAll();expect((await get("/service/state")).body.inbox).toHaveLength(0);expect((await post(`/service/inbox/${a[0].id}/read`,{})).status).toBe(403);});
 it("알림거절과 공고마감은 알림함 제외",async()=>{await gift();await pool.query("UPDATE iroun_accounts SET preferences=preferences||'{\"notifications\":false}' WHERE id=$1",[owner]);expect((await get("/service/state")).body.inbox).toHaveLength(0);});
 it("푸시 전송 실패 상태는 본인만 보고 동의 철회 후 숨김",async()=>{
  await gift(owner);await gift(other);
  await pool.query("INSERT INTO iroun_push_jobs(id,user_id,benefit_id,deadline,status) VALUES($1,$2,$3,$4,'provider_error')",[randomUUID(),owner,bId,"qa-status-isolation"]);
  const own=(await get("/service/state",owner)).body.pushDelivery;
  expect(own.state).toBe("failed");
  expect(Object.keys(own).sort()).toEqual(["enabled","message","state"]);
  expect((await get("/service/state",other)).body.pushDelivery.state).toBe("none");
  await pool.query("UPDATE iroun_accounts SET preferences=preferences||'{\"notifications\":false}' WHERE id=$1",[owner]);
  expect((await get("/service/state",owner)).body.pushDelivery.state).toBe("unavailable");
 });
 it("회수 후 새 개인판정 차단·본인 접수 준비기록 유지",async()=>{const id=await assigned();await revokeAll();const r=(await get("/service/state")).body.requests[0];expect(r.snapshot).toBeNull();expect(r.customerTasks).toEqual(["서류 준비"]);expect(r.benefitTitle).toBeTruthy();expect(r.contact).toBeTruthy();expect((await get("/service/matches")).status).toBe(403);expect((await get("/service/state",other)).body.requests).toEqual([]);});
 it("회사 알림은 동의거절·만료 후 유지·읽음 중복방지·타인차단",async()=>{
  const id=await assigned();await revokeAll();
  await pool.query("UPDATE iroun_accounts SET preferences=preferences||'{\"notifications\":false}'::jsonb WHERE id=$1",[owner]);
  expect((await get("/service/state")).body.companyUpdates[0].read).toBe(false);
  expect((await post(`/service/inbox/company:${id}/read`,{},other)).status).toBe(404);
  expect((await post(`/service/inbox/company:${id}/read`,{})).status).toBe(200);
  expect((await post(`/service/inbox/company:${id}/read`,{})).status).toBe(200);
  expect((await get("/service/state")).body.companyUpdates[0].read).toBe(true);
  expect((await pool.query("SELECT id FROM iroun_audit WHERE actor=$1 AND subject=$2 AND action='company.notice.read'",[owner,id])).rowCount).toBe(1);
  expect((await put(`/office/requests/${id}`,update(s1,{internalNote:"내부 변경만"}))).status).toBe(200);
  expect((await get("/service/state")).body.companyUpdates[0].read).toBe(true);
  expect((await put(`/office/requests/${id}`,update(s1,{state:"고객 확인"}))).status).toBe(200);
  expect((await get("/service/state")).body.companyUpdates[0].read).toBe(false);
 });
 it("탈퇴는 계약·접수·동의·문의·알림 개인정보 삭제",async()=>{await trial();await apply("자격 확인");await post("/service/inquiries",{title:"시험",body:"문의",requestKey:"qa-delete-123"});await eraseAccount(owner,`qa-del-${suffix}`,admin);for(const table of ["iroun_trials","iroun_contracts","iroun_consents","iroun_service_requests","iroun_inquiries","iroun_inbox"]){expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`,[owner])).rows[0].n).toBe(0);}expect((await get("/service/state")).status).toBe(410);});
});
