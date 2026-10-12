import {Router,type Request,type Response,type NextFunction} from "express";
import {getAuth,clerkClient} from "@clerk/express";
import {createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import {z} from "zod";
import {missingDocuments} from "./documents";
import {pool} from "@workspace/db";
import {account,audit} from "../lib/benefit-store";
import {customerPushStatus} from "../lib/push-customer-status";
import {type Benefit,matchBenefit,publicBenefit,noticeTime} from "../lib/benefit-domain";
import {CONSENT_VERSION,consentTexts,finished,historicalMatch,noticeVersion,validPhone,validKakao} from "../lib/company-domain";

const fail=(message:string,status=400,detail?:unknown)=>Object.assign(new Error(message),{status,detail});
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const uid=(req:Request)=>getAuth(req).userId!;
type Query=Pick<typeof pool,"query">;
async function transaction<T>(work:(c:Query)=>Promise<T>){const c=await pool.connect();try{await c.query("BEGIN");const result=await work(c);await c.query("COMMIT");return result;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
async function lockOwner(c:Query,id:string){
 const {rows:[a]}=await c.query("SELECT * FROM iroun_accounts WHERE id=$1 FOR UPDATE",[id]);
 if(!a||a.deleted_at)throw fail("삭제된 계정입니다.",410);
 if((await c.query("SELECT id FROM iroun_deletions WHERE user_id=$1 AND status<>'삭제 완료'",[id])).rowCount)throw fail("계정 삭제 처리 중입니다.",410);
 return a;
}
async function hasAccess(c:Query,id:string){
 const {rows:[r]}=await c.query(`SELECT (
 EXISTS(SELECT 1 FROM iroun_trials WHERE user_id=$1 AND ends_at>now()) OR
 EXISTS(SELECT 1 FROM iroun_contracts WHERE user_id=$1 AND starts_at<=now() AND ends_at>now() AND revoked_at IS NULL) OR
 EXISTS(SELECT 1 FROM iroun_grants WHERE user_id=$1 AND expires_at>now() AND revoked_at IS NULL) OR
 EXISTS(SELECT 1 FROM iroun_subscriptions WHERE user_id=$1 AND expires_at>now() AND state IN('active','cancelled'))
 ) AND coalesce((SELECT accepted FROM iroun_consents WHERE user_id=$1 AND kind='service' ORDER BY id DESC LIMIT 1),true) AS active`,[id]);
 return r.active as boolean;
}
const iso=z.string().datetime({offset:true});
const contacts=z.object({phone:z.string().max(30).refine(validPhone,"업무 전화번호 형식을 확인해 주세요."),kakao:z.string().max(300).refine(validKakao,"공식 카카오 상담 링크를 확인해 주세요.")});
const companySettings=contacts.extend({website:z.string().max(400).refine(s=>{
 if(!s)return true;try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}
},"https 회사 문의 주소를 입력해 주세요.")}).strict();
const staffInput=contacts.extend({userId:z.string().min(1).max(100),name:z.string().min(1).max(80),enabled:z.boolean()}).strict();
const contractInput=z.object({id:z.string().max(100).optional(),accountCode:z.string().min(12).max(80).optional(),userId:z.string().max(100).optional(),startsAt:iso,endsAt:iso,reason:z.string().min(5).max(500),evidence:z.string().min(5).max(500),revoke:z.boolean().optional()}).strict().refine(s=>Date.parse(s.endsAt)>Date.parse(s.startsAt),"종료일은 시작일 뒤여야 합니다.");
const inquiryInput=z.object({title:z.string().min(1).max(100),body:z.string().min(1).max(3000),requestKey:z.string().min(8).max(100)}).strict();
const requestInput=z.object({benefitId:z.string().min(1).max(80),businessId:z.string().max(80).default(""),kind:z.enum(["신청 지원","자격 확인"]),confirmed:z.boolean()}).strict();
const updateRequest=z.object({assignedTo:z.string().max(100).nullable().optional(),state:z.enum(["회사 접수","자격 확인","자료 준비","공식 신청 안내","고객 확인","회사 지원 종료"]),internalNote:z.string().max(3000).optional(),customerTasks:z.array(z.string().max(300)).max(60),staffTasks:z.array(z.string().max(300)).max(60),completedTasks:z.array(z.string().max(300)).max(120)}).strict();
export function createCompanyRouter(options:{notices?:()=>Promise<Benefit[]>;identity?:(id:string)=>Promise<string>;person?:(id:string)=>Promise<{name?:string;phone?:string}>}={}){
 const router=Router();
 const notices=options.notices??(async()=> (await pool.query("SELECT data FROM iroun_benefits")).rows.map(r=>r.data as Benefit).filter(publicBenefit));
 const identity=options.identity??(async(id:string)=>{
  const u=await clerkClient.users.getUser(id);
  // 휴대폰 인증 가입이 기본이다. 예전 이메일 가입 계정은 기존 방식(이메일) 그대로 중복을 확인한다.
  const e=u.emailAddresses.find(e=>e.id===u.primaryEmailAddressId&&e.verification?.status==="verified");
  if(e)return e.emailAddress.trim().toLowerCase();
  const p=u.phoneNumbers.find(p=>p.id===u.primaryPhoneNumberId&&p.verification?.status==="verified");
  if(!p)throw fail("휴대폰 인증 후 체험을 시작해 주세요.",403);
  return "phone:"+p.phoneNumber.replace(/\D/g,"");
 });
 // 가입 때 인증한 이름·휴대폰 번호. 확인하지 못하면 비워 둔다(추측하지 않는다).
 const person=options.person??(async(id:string)=>{
  try{const u=await clerkClient.users.getUser(id);return{name:u.firstName??undefined,phone:u.phoneNumbers.find(p=>p.id===u.primaryPhoneNumberId)?.phoneNumber};}catch{return{};}
 });
 router.use(async(req,res,next)=>{
  try{if(!getAuth(req).userId)throw fail("로그인 후 이용해 주세요.",401);res.set("Cache-Control","private, no-store");await account(uid(req));next();}catch(e){next(e);}
 });
 async function officeAccess(req:Request){
  const a=await account(uid(req));
  if(a.role==="admin")return a;
  if(a.role!=="staff"||!(await pool.query("SELECT user_id FROM iroun_staff WHERE user_id=$1 AND enabled=true",[a.id])).rowCount)throw fail("회사 담당자만 이용할 수 있습니다.",403);
  return a;
 }
 async function requestRows(id:string,isAdmin=false,isStaff=false){
  return (await pool.query(`SELECT r.*,s.name AS staff_name,s.phone AS staff_phone,s.kakao AS staff_kakao
   FROM iroun_service_requests r LEFT JOIN iroun_staff s ON s.user_id=r.assigned_to AND s.enabled=true
   JOIN iroun_accounts a ON a.id=r.user_id AND a.deleted_at IS NULL
   WHERE ${isAdmin?"true":isStaff?"r.assigned_to=$1":"r.user_id=$1"} ORDER BY r.created_at DESC`,isAdmin?[]:[id])).rows;
 }
 async function matches(id:string,period:string,year:number,office=false){
  const a=await account(id);if(!a.entitlement.active&&!office)throw fail("맞춤 확인은 유효 이용권이 필요합니다.",403);
  if(office&&!a.preferences.privacyConsent)throw fail("고객의 서비스 개인정보 동의를 확인해 주세요.",403);
  const now=Date.parse(a.serverNow);
  const output=(await notices()).filter(b=>period==="past"?finished(b,now):!finished(b,now)).filter(b=>{
   if(period!=="past")return true;
   const ended=noticeTime(b.endsAt,"end");const t=Number.isFinite(ended)?ended:Date.parse(b.checkedAt);
   return Number.isFinite(t)&&new Date(t+9*3600000).getUTCFullYear()===year;
  }).map(b=>({benefit:b,closed:finished(b,now),matches:period==="past"?historicalMatch(b,a.profile):matchBenefit(b,a.profile,new Date(now)),
   basis:period==="past"?"현재 입력정보 기준 참고 · 당시 조건 확인 필요":"현재 입력정보 기준",
   noticeYear:b.startsAt?new Date(noticeTime(b.startsAt,"start")+9*3600000).getUTCFullYear():null,
   closureBasis:b.endsAt?"공식 신청기간":b.status==="마감"?"종료 상태 확인":"예산 소진 확인",
   warning:"조건이 맞아도 선정·예산·중복수혜 검토에 따라 지급되지 않을 수 있습니다."}));
  if(!office&&!(await hasAccess(pool,id)))throw fail("맞춤 이용권이 종료되었거나 동의가 철회되었습니다.",403);
  return output;
 }
 router.get("/service/matches",async(req,res)=>{
  const year=Number(req.query.year??new Date().getFullYear());if(!Number.isInteger(year)||year<2000||year>2100)throw fail("조회 연도를 확인해 주세요.");
  res.json({items:await matches(uid(req),req.query.period==="past"?"past":"current",year),coverage:"현재 확인된 공식 자료만 비교합니다. 미수집 지역·기간은 포함하지 않습니다."});
 });
 router.get("/service/state",async(req,res)=>{
  const a=await account(uid(req));
  const consents=(await pool.query("SELECT kind,version,content,accepted,recorded_at FROM iroun_consents WHERE user_id=$1 ORDER BY id DESC LIMIT 40",[a.id])).rows;
  const inquiries=(await pool.query("SELECT * FROM iroun_inquiries WHERE user_id=$1 ORDER BY created_at DESC",[a.id])).rows;
   const requestRecords=await requestRows(a.id);
   const requests=requestRecords.map(r=>({id:r.id,benefitId:r.benefit_id,businessId:r.business_id,kind:r.kind,state:r.state,createdAt:r.created_at,
    benefitTitle:r.snapshot?.title??"접수한 공고",updatedAt:r.updated_at,
    snapshot:a.entitlement.active?r.snapshot:null,customerTasks:r.customer_tasks,completedTasks:r.completed_tasks,
   contact:r.staff_name?{name:r.staff_name,phone:r.staff_phone,kakao:r.staff_kakao}:null}));
  const {rows:[company]}=await pool.query("SELECT phone,kakao,website FROM iroun_company_settings WHERE id='company'");
   const readEvents=(await pool.query("SELECT subject,data FROM iroun_audit WHERE actor=$1 AND action='company.notice.read'",[a.id])).rows;
   const seen=new Set(readEvents.map(r=>`${r.subject}:${r.data?.version}`));
   const companyUpdates=requestRecords.map(r=>({id:`company:${r.id}`,requestId:r.id,
    title:r.state==="회사 접수"?"회사에 요청이 접수됐어요":"접수 상태·서류 안내가 변경됐어요",
    state:r.state,updatedAt:r.updated_at,read:seen.has(`${r.id}:${hash(JSON.stringify([r.state,r.assigned_to,r.customer_tasks,r.completed_tasks]))}`)}));
  if(a.entitlement.active&&a.preferences.notifications&&a.preferences.personalizedAlerts){
   const bs=await notices();
   for(const b of bs.filter(b=>!finished(b,Date.parse(a.serverNow)))){
     if(!options.notices&&!(await pool.query("SELECT id FROM iroun_benefits WHERE id=$1 AND updated_at>now()-interval '7 days' AND data->>'reviewStatus'='공개' AND data->>'isTest'='false'",[b.id])).rowCount)continue;
    if(!matchBenefit(b,a.profile,new Date(a.serverNow)).some(m=>m.result!=="대상 제외"))continue;
    // Durable dedup. Content is generic; no money/reasons/household data.
    await pool.query("INSERT INTO iroun_inbox(id,user_id,benefit_id,version_hash) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,benefit_id,version_hash) DO NOTHING",[randomUUID(),a.id,b.id,noticeVersion(b)]);
   }
  }
  const bs=new Map((await notices()).map(b=>[b.id,b]));
  const inbox=a.entitlement.active&&a.preferences.notifications&&a.preferences.personalizedAlerts?
   (await pool.query("SELECT id,benefit_id,read_at,created_at FROM iroun_inbox WHERE user_id=$1 ORDER BY created_at DESC",[a.id])).rows
    .filter(r=>bs.has(r.benefit_id)&&!finished(bs.get(r.benefit_id)!,Date.parse(a.serverNow))).map(r=>({...r,title:"새 혜택 안내를 확인해 주세요."})):[];
  const {rows:[ledger]}=await pool.query("SELECT user_id FROM iroun_trials WHERE user_id=$1",[a.id]);
  const finalActive=await hasAccess(pool,a.id);
  const pushDelivery=await customerPushStatus(a.id,finalActive&&a.preferences.notifications&&a.preferences.personalizedAlerts);
  res.json({account:{...a,entitlement:{...a.entitlement,active:finalActive}},membership:a.entitlement.contractActive?"계약회원":a.entitlement.trialActive?"3일 체험회원":a.entitlement.active?"기존 이용권 회원":"무료회원",
    pushDelivery,companyUpdates,consents,consentVersion:CONSENT_VERSION,consentTexts,trialUsed:!!ledger,requests:finalActive?requests:requests.map(r=>({...r,snapshot:null})),inquiries,inbox:finalActive?inbox:[],company:company??{phone:"",kakao:"",website:""},
   limitations:["체험은 인증 이메일·계정당 1회입니다. 다른 이메일을 쓰는 동일인 본인확인은 미연동입니다.","실제 푸시·스토어 판매·전국 자동수집은 미연결입니다."]});
 });
 router.post("/service/consents",async(req,res)=>{
  const input=z.object({kind:z.enum(["service","marketing"]),accepted:z.boolean(),version:z.literal(CONSENT_VERSION)}).strict().parse(req.body);
  await transaction(async c=>{
   await lockOwner(c,uid(req));
   await c.query("INSERT INTO iroun_consents(user_id,kind,version,content,accepted) VALUES($1,$2,$3,$4,$5)",[uid(req),input.kind,input.version,consentTexts[input.kind],input.accepted]);
   if(input.kind==="service"){
    await c.query("UPDATE iroun_accounts SET preferences=preferences||$2::jsonb WHERE id=$1",[uid(req),JSON.stringify({privacyConsent:input.accepted,...(!input.accepted?{notifications:false,personalizedAlerts:false}:{})})]);
    if(!input.accepted){await c.query("DELETE FROM iroun_push_devices WHERE user_id=$1",[uid(req)]);await c.query("UPDATE iroun_push_jobs SET status='cancelled' WHERE user_id=$1 AND status='pending'",[uid(req)]);}
   }
  });
  res.json({message:input.accepted?"동의를 저장했습니다.":"동의를 철회했습니다."});
 });
 router.post("/service/trial",async(req,res)=>{
  z.object({}).strict().parse(req.body??{});const a=await account(uid(req));
  if(!a.preferences.privacyConsent||(!a.profile.step&&!a.profile.personal.province&&!a.profile.businesses.length))throw fail("서비스 개인정보 동의와 첫 정보 입력 후 시작해 주세요.",409);
  const email=await identity(a.id);
  const secret=process.env.SESSION_SECRET;if(!secret)throw fail("체험 중복 확인 설정이 필요합니다.",503);
  const digest=createHmac("sha256",secret).update("trial-email:"+email).digest("hex");
  await transaction(async c=>{
   const latest=await lockOwner(c,a.id);
   const latestConsent=(await c.query("SELECT accepted,version FROM iroun_consents WHERE user_id=$1 AND kind='service' ORDER BY id DESC LIMIT 1",[a.id])).rows[0];
   if(!latest.preferences.privacyConsent||latestConsent?.accepted!==true||latestConsent?.version!==CONSENT_VERSION||(!latest.profile.step&&!latest.profile.personal.province&&!latest.profile.businesses.length))throw fail("최신 서비스 동의와 최소 정보 입력을 다시 확인해 주세요.",409);
   if((await c.query("SELECT user_id FROM iroun_trials WHERE user_id=$1",[a.id])).rowCount)throw fail("이미 체험을 시작한 계정입니다. 다시 시작하거나 연장할 수 없습니다.",409);
   if(!(await c.query("INSERT INTO iroun_trial_ledger(identity_hash) VALUES($1) ON CONFLICT DO NOTHING RETURNING identity_hash",[digest])).rowCount)throw fail("이 번호(또는 이메일)는 이미 무료체험을 사용했습니다.",409);
   await c.query("INSERT INTO iroun_trials(user_id,ends_at) VALUES($1,now()+interval '72 hours')",[a.id]);
   await audit(a.id,"trial.start",a.id,{durationHours:72},c);
  });
  res.json({message:"연속 72시간 무료체험을 시작했습니다.",account:await account(a.id)});
 });
 router.post("/service/owner-code",async(req,res)=>{
  const code=randomBytes(12).toString("hex");
  await pool.query("INSERT INTO iroun_owner_codes(code_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[hash(code),uid(req)]);
  res.json({code,message:"15분 동안 유효한 본인 계정 연결번호입니다. 회사 담당자에게만 전달해 주세요."});
 });
 router.post("/service/requests",async(req,res)=>{
  const input=requestInput.parse(req.body);const b=(await notices()).find(b=>b.id===input.benefitId);
  if(!b)throw fail("공개된 공식 공고를 찾을 수 없습니다.",404);
  const result=await transaction(async c=>{
   const a=await lockOwner(c,uid(req));
   if(!(await hasAccess(c,a.id)))throw fail("유효 체험·계약 또는 기존 이용권이 필요합니다.",403);
   // 회사 신청 도움은 계약 고객만 요청할 수 있다. 체험·무료 회원은 공고와 신청 순서만 본다.
   if(!(await c.query("SELECT 1 FROM iroun_contracts WHERE user_id=$1 AND revoked_at IS NULL AND starts_at<=now() AND ends_at>now()",[a.id])).rowCount)throw fail("회사 신청 도움은 계약 고객만 요청할 수 있습니다.",403);
   const {rows:[record]}=await c.query("SELECT data FROM iroun_benefits WHERE id=$1 FOR SHARE",[b.id]);
   const latest=options.notices?b:record?.data as Benefit;
   if(!latest||!publicBenefit(latest))throw fail("공고가 비공개로 변경되었습니다.",409);
   Object.assign(b,latest);
   const {rows:[clock]}=await c.query("SELECT now() AS now");const now=clock.now as Date;
   if(finished(b,now.getTime()))throw fail("마감된 공고는 신청 지원 접수를 할 수 없습니다. 문의 화면을 이용해 주세요.",409);
   const decision=matchBenefit(b,a.profile,now).find(m=>m.businessId===input.businessId);
   if(!decision)throw fail("현재 등록된 사업장을 선택해 주세요.",409);
   if(input.kind==="신청 지원"&&decision.result!=="조건 일치")throw fail(decision.result==="대상 제외"?"입력 조건과 다른 항목이 있습니다. 정보를 수정하거나 자격확인 문의를 보내 주세요.":"추가 확인이 필요합니다. 자격확인 문의로 보내 주세요.",409,decision);
   if(!input.confirmed)throw fail("회사에 요청하는 내용임을 확인해 주세요.");
   // 서류를 모두 올린 고객만 요청할 수 있다. 요청 뒤에 다시 서류를 안내하지 않기 위해서다.
   const lacking=await missingDocuments(a.id,b.documents,c);
   if(lacking.length)throw fail("필요한 서류를 먼저 등록해 주세요.",409,{result:"서류 필요",missingDocuments:lacking});
   const snapshot={decision,profileUpdatedBasis:"접수 시 입력정보 기준",title:b.title,sourceUrl:b.sourceUrl,sourceId:b.sourceId,checkedAt:b.checkedAt,endsAt:b.endsAt,documents:b.documents,checks:b.checks,warning:"회사 접수이며 기관 신청·승인·지급 완료가 아닙니다."};
   const prior=(await c.query("SELECT id,kind FROM iroun_service_requests WHERE user_id=$1 AND benefit_id=$2 AND business_id=$3",[a.id,b.id,input.businessId])).rows[0];
   if(prior){
    if(prior.kind==="자격 확인"&&input.kind==="신청 지원"){
     await c.query("UPDATE iroun_service_requests SET kind='신청 지원',state='회사 접수',snapshot=$2,customer_tasks=$3,updated_at=now() WHERE id=$1",[prior.id,JSON.stringify(snapshot),JSON.stringify(b.documents.map(d=>`${d} 준비 · 발급처는 공식 원문 확인`))]);
     await audit(a.id,"request.upgrade",prior.id,{kind:input.kind,decision},c);
     return{id:prior.id,message:"조건을 다시 확인하여 기존 문의를 회사 신청 지원 요청으로 전환했습니다. 기관 신청 완료는 아닙니다."};
    }
    return {id:prior.id,message:"이미 회사에 접수한 요청입니다. 기존 접수 내역을 확인해 주세요."};
   }
   const id=randomUUID();
   const customerTasks=b.documents.map(d=>`${d} 준비 · 발급처는 공식 원문 확인`);
   const staffTasks=["공식 원문과 마감·예산 재확인","부족정보·중복수혜를 고객과 확인","서류 발급처 확인 후 안내","공식 신청처와 행동 순서 안내","기관 접수 여부를 고객에게 확인 (미확인 시 완료 표시 금지)"];
   await c.query("INSERT INTO iroun_service_requests(id,user_id,benefit_id,business_id,kind,snapshot,customer_tasks,staff_tasks) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,a.id,b.id,input.businessId,input.kind,JSON.stringify(snapshot),JSON.stringify(customerTasks),JSON.stringify(staffTasks)]);
   await audit(a.id,"request.create",id,{kind:input.kind,decision},c);
   return {id,message:"회사에 신청 지원 요청을 저장했습니다. 정부기관에 신청된 것은 아닙니다."};
  });
  res.json(result);
 });
 router.post("/service/inquiries",async(req,res)=>{
  const input=inquiryInput.parse(req.body);const id=randomUUID();
  const {rows:[r]}=await pool.query("INSERT INTO iroun_inquiries(id,user_id,title,body,request_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,request_key) DO UPDATE SET request_key=excluded.request_key RETURNING id",[id,uid(req),input.title,input.body,input.requestKey]);
  res.json({id:r.id,message:"회사 문의함에 저장했습니다."});
 });
 router.post("/service/inbox/:id/read",async(req,res)=>{
  if(String(req.params.id).startsWith("company:")){
   const id=String(req.params.id).slice(8);
   await transaction(async c=>{
    const {rows:[r]}=await c.query("SELECT state,assigned_to,customer_tasks,completed_tasks FROM iroun_service_requests WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,uid(req)]);
    if(!r)throw fail("내 접수 알림을 찾을 수 없습니다.",404);
    const version=hash(JSON.stringify([r.state,r.assigned_to,r.customer_tasks,r.completed_tasks]));
    const prior=await c.query("SELECT 1 FROM iroun_audit WHERE actor=$1 AND action='company.notice.read' AND subject=$2 AND data->>'version'=$3",[uid(req),id,version]);
    if(!prior.rowCount)await audit(uid(req),"company.notice.read",id,{version},c);
   });
   res.json({message:"접수 알림을 확인했어요."});return;
  }
  const a=await account(uid(req));if(!a.entitlement.active||!a.preferences.notifications||!a.preferences.personalizedAlerts)throw fail("현재 맞춤 알림을 이용할 수 없습니다.",403);
  const r=await pool.query("UPDATE iroun_inbox SET read_at=now() WHERE id=$1 AND user_id=$2 RETURNING benefit_id",[req.params.id,a.id]);
  if(!r.rowCount)throw fail("알림을 찾을 수 없습니다.",404);
  const b=(await notices()).find(b=>b.id===r.rows[0].benefit_id);
  if(!b||finished(b,Date.parse(a.serverNow)))throw fail("공고가 마감되거나 비공개로 변경되었습니다.",409);
  if(!(await hasAccess(pool,a.id)))throw fail("맞춤 이용권이 종료되었습니다.",403);
  res.json({benefitId:b.id});
 });
 router.get("/office/state",async(req,res)=>{
  const a=await officeAccess(req);const admin=a.role==="admin";const requests=await requestRows(a.id,admin,!admin);
  const customerRows=(await pool.query(`SELECT id,role,profile FROM iroun_accounts WHERE deleted_at IS NULL ${admin?"":"AND id IN(SELECT user_id FROM iroun_service_requests WHERE assigned_to=$1)"}`,admin?[]:[a.id])).rows;
  const customers=await Promise.all(customerRows.map(async r=>({...r,...await person(r.id)})));
  const inquiries=(await pool.query(`SELECT * FROM iroun_inquiries WHERE ${admin?"true":"user_id IN(SELECT user_id FROM iroun_service_requests WHERE assigned_to=$1)"} ORDER BY created_at DESC`,admin?[]:[a.id])).rows;
  const staff=admin?(await pool.query("SELECT * FROM iroun_staff")).rows:[];
  const contracts=admin?(await pool.query("SELECT * FROM iroun_contracts ORDER BY created_at DESC")).rows:[];
  const {rows:[company]}=await pool.query("SELECT * FROM iroun_company_settings WHERE id='company'");
  res.json({admin,requests,customers,inquiries,staff,contracts,company:company??{phone:"",kakao:"",website:""},contractPolicy:"169만원 연간 패키지 계약의 계정 연결 기록입니다. 여기서 결제하지 않습니다. 외부 계약의 디지털 이용권 제공은 스토어 심사 적합성 별도 검토가 필요합니다."});
 });
 router.get("/office/customers/:id/matches",async(req,res)=>{
  const a=await officeAccess(req);const id=String(req.params.id);
  if(a.role!=="admin"&&!(await pool.query("SELECT id FROM iroun_service_requests WHERE user_id=$1 AND assigned_to=$2",[id,a.id])).rowCount)throw fail("배정된 고객만 확인할 수 있습니다.",403);
  const year=Number(req.query.year??new Date().getFullYear());
  if(!Number.isInteger(year)||year<2000||year>2100)throw fail("조회 연도를 확인해 주세요.");
  res.json({items:await matches(id,req.query.period==="past"?"past":"current",year,true)});
 });
 router.post("/office/contracts",async(req,res)=>{
  const a=await officeAccess(req);if(a.role!=="admin")throw fail("관리자만 계약을 관리할 수 있습니다.",403);
  const input=contractInput.parse(req.body);
  const result=await transaction(async c=>{
   let customer:string;
   if(input.id){
    const {rows:[old]}=await c.query("SELECT * FROM iroun_contracts WHERE id=$1 FOR UPDATE",[input.id]);if(!old)throw fail("계약을 찾을 수 없습니다.",404);
    if(input.userId&&input.userId!==old.user_id)throw fail("계약 고객을 다른 계정으로 변경할 수 없습니다.",409);
    customer=old.user_id;
   }else{
    if(!input.accountCode)throw fail("고객 본인이 발급한 계정 연결번호가 필요합니다.");
    const {rows:[code]}=await c.query("SELECT * FROM iroun_owner_codes WHERE code_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE",[hash(input.accountCode)]);
    if(!code)throw fail("계정 연결번호가 만료되었거나 사용되었습니다.",409);
    customer=code.user_id;
    if(input.userId&&input.userId!==customer)throw fail("연결번호 소유 계정과 선택 고객이 다릅니다.",409);
    await c.query("UPDATE iroun_owner_codes SET used_at=now() WHERE code_hash=$1",[hash(input.accountCode)]);
   }
   await lockOwner(c,customer);
   const id=input.id??randomUUID();
   await c.query(`INSERT INTO iroun_contracts(id,user_id,starts_at,ends_at,reason,evidence,actor,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END)
    ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,evidence=excluded.evidence,actor=excluded.actor,revoked_at=excluded.revoked_at`,[id,customer,input.startsAt,input.endsAt,input.reason,input.evidence,a.id,!!input.revoke]);
   await audit(a.id,input.revoke?"contract.revoke":input.id?"contract.extend":"contract.bind",customer,{id,startsAt:input.startsAt,endsAt:input.endsAt,reason:input.reason,evidence:input.evidence,identity:"고객 발급 계정 연결번호 (신규 연결)",packageWon:1690000},c);
   return {id,userId:customer,message:input.revoke?"계약 이용권을 회수했습니다.":"계약 이용권을 저장했습니다."};
  });res.json(result);
 });
 router.post("/office/staff",async(req,res)=>{
  const a=await officeAccess(req);if(a.role!=="admin")throw fail("관리자만 직원을 등록할 수 있습니다.",403);
  const input=staffInput.parse(req.body);
  await transaction(async c=>{
   const target=await lockOwner(c,input.userId);if(target.role==="admin")throw fail("관리자 계정의 역할은 이 화면에서 변경할 수 없습니다.",409);
   await c.query("INSERT INTO iroun_staff(user_id,name,phone,kakao,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,kakao=excluded.kakao,enabled=excluded.enabled",[input.userId,input.name,input.phone,input.kakao,input.enabled]);
   await c.query("UPDATE iroun_accounts SET role=$2 WHERE id=$1",[input.userId,input.enabled?"staff":"customer"]);
   await audit(a.id,"staff.update",input.userId,{...input},c);
  });res.json({message:"직원과 업무 연락처를 저장했습니다."});
 });
 router.put("/office/settings",async(req,res)=>{
  const a=await officeAccess(req);if(a.role!=="admin")throw fail("관리자만 회사 문의 주소를 설정할 수 있습니다.",403);
  const input=companySettings.parse(req.body);
  await pool.query("INSERT INTO iroun_company_settings(id,phone,kakao,website) VALUES('company',$1,$2,$3) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,kakao=excluded.kakao,website=excluded.website",[input.phone,input.kakao,input.website]);
  await audit(a.id,"company.contact", "company",input);res.json({message:"회사 문의 경로를 저장했습니다."});
 });
 router.put("/office/requests/:id",async(req,res)=>{
  const a=await officeAccess(req);const input=updateRequest.parse(req.body);
  await transaction(async c=>{
   const {rows:[r]}=await c.query("SELECT * FROM iroun_service_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
   if(!r||(a.role!=="admin"&&r.assigned_to!==a.id))throw fail("접수에 접근할 수 없습니다.",403);
   if(a.role!=="admin"&&input.assignedTo!==undefined&&input.assignedTo!==r.assigned_to)throw fail("담당자 변경은 관리자만 할 수 있습니다.",403);
   const assignee=input.assignedTo===undefined?r.assigned_to:input.assignedTo;
   if(assignee&&!(await c.query("SELECT user_id FROM iroun_staff WHERE user_id=$1 AND enabled=true",[assignee])).rowCount)throw fail("활성 직원을 선택해 주세요.");
   await c.query("UPDATE iroun_service_requests SET assigned_to=$2,state=$3,internal_note=$4,customer_tasks=$5,staff_tasks=$6,completed_tasks=$7,updated_at=now() WHERE id=$1",[r.id,assignee,input.state,input.internalNote??r.internal_note,JSON.stringify(input.customerTasks),JSON.stringify(input.staffTasks),JSON.stringify(input.completedTasks)]);
   await audit(a.id,"request.update",r.id,{before:{assignedTo:r.assigned_to,state:r.state},after:{assignedTo:assignee,state:input.state,completedTasks:input.completedTasks}},c);
  });res.json({message:"회사 진행상태와 업무를 저장했습니다. 기관 처리 결과는 아닙니다."});
 });
 router.post("/office/inquiries/:id/reply",async(req,res)=>{
  const a=await officeAccess(req);const input=z.object({body:z.string().min(1).max(3000),state:z.enum(["접수됨","확인 중","답변 완료"])}).strict().parse(req.body);
  await transaction(async c=>{
   const {rows:[q]}=await c.query("SELECT * FROM iroun_inquiries WHERE id=$1 FOR UPDATE",[req.params.id]);if(!q)throw fail("문의를 찾을 수 없습니다.",404);
   if(a.role!=="admin"&&!(await c.query("SELECT id FROM iroun_service_requests WHERE user_id=$1 AND assigned_to=$2",[q.user_id,a.id])).rowCount)throw fail("배정된 고객의 문의만 답변할 수 있습니다.",403);
   await c.query("UPDATE iroun_inquiries SET state=$2,replies=replies||$3::jsonb WHERE id=$1",[q.id,input.state,JSON.stringify([{body:input.body,at:new Date().toISOString(),author:"회사 담당자"}])]);
   await audit(a.id,"inquiry.reply",q.id,{state:input.state},c);
  });res.json({message:"고객에게 표시되는 답변을 저장했습니다."});
 });
 router.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  const e=err as {status?:number;message?:string;detail?:unknown};
  res.status(err instanceof z.ZodError?400:e.status??500).json({error:err instanceof z.ZodError?"입력 내용을 확인해 주세요.":e.status?e.message:"저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",...(e.detail?{detail:e.detail}:{})});
 });
 return router;
}
export const companyRouter=createCompanyRouter();
