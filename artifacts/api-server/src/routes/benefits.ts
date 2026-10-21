import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { account, audit, connections } from "../lib/benefit-store";
import { benefitSchema, excludedCategory, matchBenefit, normalizeSourceKey, officialUrl, preferencesSchema, profileSchema, publicBenefit, trackingSchema, type Benefit } from "../lib/benefit-domain";
import { billingConfig,syncCustomer,validWebhookAuthorization } from "../lib/store-provider";
import { registerDevice } from "../lib/push-delivery";
import { bizinfoStatus,runBizinfoFeed } from "../lib/official-feed";
import { extractNotice } from "../lib/notice-extract";
import {publicFeedStatus,runPublicFeed} from "../lib/public-feeds";
import {aiJob,aiReady,runAiStructuring} from "../lib/ai-structure";
import {bulkFeedStatus,hideDuplicates,runGov24Bulk,runKstartup} from "../lib/bulk-feeds";
import {collectAll} from "../lib/service-scheduler";
import {claimPendingCrm,ensureCrmTables,crmSyncReady} from "../lib/crm-contracts";

type AuthedRequest = Request & { customerId?: string };
export const benefitsRouter = Router();
function fail(message: string, status = 400) { return Object.assign(new Error(message), {status}); }
function userId(req: Request) { const id = (req as AuthedRequest).customerId; if (!id) throw fail("로그인이 필요합니다.",401); return id; }
const authenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = getAuth(req).userId;
    if (!id) throw fail("로그인이 필요합니다.",401);
    (req as AuthedRequest).customerId = id;
    await account(id);
    res.set("Cache-Control","private, no-store");
    next();
  } catch(e) {next(e);}
};
const administrator = async (req: Request, _res: Response, next: NextFunction) => {
  try {if ((await account(userId(req))).role !== "admin") throw fail("관리자만 이용할 수 있습니다.",403); next();} catch(e) {next(e);}
};
async function allBenefits() {return (await pool.query("SELECT data FROM iroun_benefits ORDER BY updated_at DESC")).rows.map(r=>r.data as Benefit);}
async function visibleBenefit(id: string) { const b=(await allBenefits()).find(b=>b.id===id && publicBenefit(b)); if(!b) throw fail("공개된 혜택을 찾을 수 없습니다.",404); return b; }

benefitsRouter.get("/benefits", async(req,res)=>{
  let items = (await allBenefits()).filter(publicBenefit);
  for (const key of ["kind","audience","region","status"] as const) {
    const value = req.query[key];
    if (typeof value === "string" && value && value !== "전체") items=items.filter(b=>b[key]===value || (key==="region" && b.region==="전국"));
  }
  if (typeof req.query.search === "string") {const q = req.query.search.trim().slice(0,200).toLowerCase(); items=items.filter(b=>`${b.title} ${b.summary} ${b.category} ${b.agency} ${b.support}`.toLowerCase().includes(q));}
  res.json(items);
});
benefitsRouter.get("/benefits/:id", async(req,res)=>res.json(await visibleBenefit(String(req.params.id))));
benefitsRouter.get("/membership", async(req,res)=>{
  const auth=getAuth(req);
  const access=auth.userId ? (await account(auth.userId)).entitlement : {active:false,subscriptionActive:false,grantActive:false};
  const c=billingConfig();
  res.set("Cache-Control","private, no-store").json({...c,message:c.configured?"검증 제공자 설정됨. 가격·구매는 네이티브 스토어에서 확인하며 권한은 서버 검증 후 반영합니다.":"스토어 상품·월요금·구매 검증 연결 전입니다. 현재 구매할 수 없습니다.",entitlement:access});
});
benefitsRouter.get("/me",authenticated,async(req,res)=>{
  // 가입 전에 회사 전산에서 받은 패키지 계약이 있으면 인증된 휴대폰 번호로 연결한다.
  await claimPendingCrm(userId(req)).catch(()=>0);
  res.json(await account(userId(req)));
});
benefitsRouter.put("/profile",authenticated,async(req,res)=>{
  const id=userId(req), a=await account(id);
  if(!a.preferences.privacyConsent) throw fail("먼저 개인정보 수집·이용에 동의해 주세요.");
  const profile=profileSchema.parse(req.body);
  await pool.query("UPDATE iroun_accounts SET profile=$2 WHERE id=$1",[id,JSON.stringify(profile)]);
  res.json(profile);
});
benefitsRouter.get("/recommendations",authenticated,async(req,res)=>{
  const a=await account(userId(req));
  if(!a.entitlement.active) throw fail("맞춤 결과는 유효한 구독 또는 관리자 무상 이용권이 필요합니다.",403);
  const output=(await allBenefits()).filter(publicBenefit).flatMap(b=>matchBenefit(b,a.profile));
  res.set("Cache-Control","private, no-store").json(output);
});
benefitsRouter.get("/tracking",authenticated,async(req,res)=>{
  const {rows}=await pool.query("SELECT data FROM iroun_tracking WHERE user_id=$1",[userId(req)]);
  res.json(rows.map(r=>r.data));
});
benefitsRouter.put("/tracking/:benefitId",authenticated,async(req,res)=>{
  const id=userId(req), b=await visibleBenefit(String(req.params.benefitId)), input=trackingSchema.parse(req.body), a=await account(id);
  if(input.deadlineReminder && !a.preferences.notifications) throw fail("먼저 알림 수신에 동의해 주세요.");
  if(input.checkedDocuments.some(d=>!b.documents.includes(d))) throw fail("공고의 준비서류만 체크할 수 있습니다.");
  const data={...input,benefitId:b.id,updatedAt:new Date().toISOString(),verification:"고객이 직접 기록한 상태입니다. 기관 접수·선정·지급이 확인된 정보가 아닙니다."};
  await pool.query("INSERT INTO iroun_tracking(user_id,benefit_id,data) VALUES($1,$2,$3) ON CONFLICT(user_id,benefit_id) DO UPDATE SET data=EXCLUDED.data",[id,b.id,JSON.stringify(data)]);
  res.json(data);
});
benefitsRouter.delete("/tracking/:benefitId",authenticated,async(req,res)=>{
  await pool.query("DELETE FROM iroun_tracking WHERE user_id=$1 AND benefit_id=$2",[userId(req),String(req.params.benefitId)]);
  res.json({message:"내 저장내역을 삭제했습니다."});
});
benefitsRouter.put("/preferences",authenticated,async(req,res)=>{
  const id=userId(req), input=preferencesSchema.parse(req.body), a=await account(id);
  if(input.personalizedAlerts && (!input.notifications || !a.entitlement.active)) throw fail("맞춤 알림은 알림 동의와 유효 이용권이 필요합니다.",403);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("UPDATE iroun_accounts SET preferences=$2, profile=CASE WHEN $3 THEN profile ELSE '{\"personal\":{},\"businesses\":[],\"step\":0}'::jsonb END WHERE id=$1",[id,JSON.stringify(input),input.privacyConsent]);
    if(!input.notifications) await client.query("DELETE FROM iroun_push_devices WHERE user_id=$1",[id]);
    await audit(id,"동의 설정 변경",id,{privacyConsent:input.privacyConsent,notifications:input.notifications,accountConsent:input.accountConsent,termsConsent:input.termsConsent,policyVersion:"2026-10-10 초안"},client);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  res.json(input);
});
benefitsRouter.post("/membership/restore",authenticated,async(req,res)=>res.json({entitlement:await syncCustomer(userId(req)),message:"기관 확인 결과를 반영했습니다. 구독이 없으면 이용권을 부여하지 않습니다."}));
benefitsRouter.post("/membership/sync",authenticated,async(req,res)=>res.json({entitlement:await syncCustomer(userId(req)),message:"스토어 검증 결과를 반영했습니다."}));
benefitsRouter.post("/notifications/device",authenticated,async(req,res)=>{
  const a=await account(userId(req));
  if(!a.preferences.notifications||!a.entitlement.active) throw fail("알림 동의와 유효 이용권이 필요합니다.",403);
  const body=z.object({token:z.string().max(250)}).strict().parse(req.body);
  await registerDevice(userId(req),body.token);
  res.json({message:"기기 알림 수신 정보를 저장했습니다. 발송·기기 수신 완료를 의미하지 않습니다."});
});
benefitsRouter.delete("/notifications/device",authenticated,async(req,res)=>{
  await pool.query("DELETE FROM iroun_push_devices WHERE user_id=$1",[userId(req)]);
  res.json({message:"내 기기 알림 수신 정보를 삭제했습니다."});
});
benefitsRouter.post("/billing/webhook",async(req,res)=>{
  if(!validWebhookAuthorization(req.get("authorization"))) throw fail("검증기관 인증이 필요합니다.",401);
  const input=z.object({event:z.object({id:z.string().min(1).max(200),app_user_id:z.string().regex(/^user_[A-Za-z0-9]+$/)})}).parse(req.body);
  const event=input.event;
  if(!(await pool.query("SELECT id FROM iroun_accounts WHERE id=$1 AND deleted_at IS NULL",[event.app_user_id])).rowCount){res.json({ignored:true});return;}
  const claim=await pool.query("INSERT INTO iroun_billing_events(id,status) VALUES($1,'processing') ON CONFLICT(id) DO UPDATE SET status='processing',created_at=now() WHERE iroun_billing_events.status<>'complete' AND iroun_billing_events.created_at<now()-interval '1 minute' RETURNING id",[event.id]);
  if(!claim.rowCount){
    if((await pool.query("SELECT status FROM iroun_billing_events WHERE id=$1",[event.id])).rows[0]?.status!=="complete") throw fail("검증 결과 처리 중입니다. 다시 전달해 주세요.",503);
    res.json({duplicate:true});return;
  }
  try{
    await syncCustomer(event.app_user_id); // Never trusts notification expiry/active.
    await pool.query("UPDATE iroun_billing_events SET status='complete' WHERE id=$1",[event.id]);
    res.json({processed:true});
  }catch(e){
    await pool.query("UPDATE iroun_billing_events SET status='failed',created_at=now()-interval '2 minutes' WHERE id=$1",[event.id]);throw e;
  }
});
benefitsRouter.post("/account/deletion",authenticated,async(req,res)=>{
  const id=userId(req);
  const input=z.object({confirmation:z.literal("회원 탈퇴")}).strict().safeParse(req.body);
  if(!input.success) throw fail("확인 문구로 '회원 탈퇴'를 입력해 주세요.");
  const auth=getAuth(req);
  if(!auth.sessionId) throw fail("다시 로그인한 뒤 탈퇴해 주세요.",403);
  const session=await clerkClient.sessions.getSession(auth.sessionId);
  if(Date.now()-session.createdAt>10*60*1000) throw fail("개인정보 보호를 위해 로그아웃 후 다시 로그인하고 10분 안에 탈퇴해 주세요.",403);
  const deletionId=randomUUID();
  const pendingClient=await pool.connect();
  try{
    await pendingClient.query("BEGIN");
    await pendingClient.query("SELECT id FROM iroun_accounts WHERE id=$1 FOR NO KEY UPDATE",[id]);
    await pendingClient.query("INSERT INTO iroun_deletions(id,user_id) VALUES($1,$2)",[deletionId,id]);
    await pendingClient.query("DELETE FROM iroun_push_devices WHERE user_id=$1",[id]);
    await pendingClient.query("COMMIT");
  }catch(e){await pendingClient.query("ROLLBACK");throw e;}finally{pendingClient.release();}
  // Delete identity first; if the provider fails, request stays pending for operator retry.
  await clerkClient.users.deleteUser(id);
  await eraseAccount(id,deletionId,id);
  res.json({message:"회원 탈퇴 및 서비스 개인정보 삭제가 완료됐습니다. Apple·Google 구독은 스토어에서 별도로 해지해 주세요."});
});
export async function eraseAccount(id:string,deletionId:string,actor:string){
  await ensureCrmTables();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("DELETE FROM iroun_tracking WHERE user_id=$1",[id]);
    await client.query("DELETE FROM iroun_grants WHERE user_id=$1",[id]);
    await client.query("DELETE FROM iroun_subscriptions WHERE user_id=$1",[id]);
    await client.query("UPDATE iroun_service_requests SET assigned_to=NULL WHERE assigned_to=$1",[id]);
    // 전산 계약 연결은 다른 계정으로 옮겨지지 않도록 남기되, 번호 해시는 지우고 회사 확인으로 돌린다.
    await client.query("UPDATE iroun_crm_links SET phone_hash=NULL,state=CASE WHEN status='active' THEN 'review_required' ELSE state END,review_reason=CASE WHEN status='active' THEN '연결된 계정 삭제' ELSE review_reason END,updated_at=now() WHERE user_id=$1",[id]);
    for(const table of ["iroun_push_devices","iroun_push_jobs","iroun_billing_sync","iroun_billing_transactions","iroun_trials","iroun_contracts","iroun_owner_codes","iroun_consents","iroun_staff","iroun_service_requests","iroun_inquiries","iroun_inbox"]) await client.query(`DELETE FROM ${table} WHERE user_id=$1`,[id]);
    await client.query("UPDATE iroun_accounts SET profile='{\"personal\":{},\"businesses\":[],\"step\":0}',preferences='{\"largeText\":false,\"notifications\":false,\"privacyConsent\":false,\"personalizedAlerts\":false}',role='customer',deleted_at=now() WHERE id=$1",[id]);
    // Retain only a pseudonymous tombstone to prevent old sessions recreating a deleted account.
    await client.query("UPDATE iroun_deletions SET status='삭제 완료',completed_at=now() WHERE id=$1",[deletionId]);
    await audit(actor,"회원 개인정보 삭제",id,{deletionId},client);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
benefitsRouter.use("/admin",authenticated,administrator);
// 회사 전산 계약 연결 현황. 전화번호·전산 메모는 내보내지 않는다.
benefitsRouter.get("/admin/crm-contracts",async(_req,res)=>{
  await ensureCrmTables();
  const {rows}=await pool.query("SELECT crm_contract_id AS \"contractId\",crm_customer_id AS \"crmCustomerId\",user_id AS \"userId\",version,status,state,review_reason AS \"reviewReason\",starts_at AS \"startsAt\",ends_at AS \"endsAt\",updated_at AS \"updatedAt\" FROM iroun_crm_links ORDER BY updated_at DESC LIMIT 500");
  res.json({syncReady:crmSyncReady(),links:rows});
});
benefitsRouter.get("/admin/dashboard",async(_req,res)=>{
  const users=(await pool.query("SELECT id FROM iroun_accounts WHERE deleted_at IS NULL ORDER BY id")).rows;
  const customers=await Promise.all(users.map(async r=>{
    const a=await account(r.id,true);
    try {
      const identity=await clerkClient.users.getUser(r.id);
      const email=identity.emailAddresses.find(e=>e.id===identity.primaryEmailAddressId)?.emailAddress;
      return {...a,email,displayName:[identity.firstName,identity.lastName].filter(Boolean).join(" ")||identity.username||email||a.id,identityStatus:"인증 계정 확인"};
    } catch {
      return {...a,identityStatus:"인증 제공자의 계정 정보 확인 필요"};
    }
  }));

  res.json({benefits:await allBenefits(),users:customers,
    audit:(await pool.query("SELECT * FROM iroun_audit ORDER BY id DESC LIMIT 300")).rows,
    deletions:(await pool.query("SELECT * FROM iroun_deletions ORDER BY created_at DESC LIMIT 100")).rows,
    connections:[...connections.filter(c=>!["정부24","기업마당"].includes(c.name)),await bizinfoStatus(),...await publicFeedStatus(),...await bulkFeedStatus()]});
});
// 공고 원문을 붙여 넣으면 지역·조건·금액·서류를 뽑아 준다. 저장하지 않고 결과만 돌려준다.
benefitsRouter.post("/admin/extract",async(req,res)=>{
  const input=z.object({title:z.string().max(200),text:z.string().min(1).max(30000)}).strict().parse(req.body);
  res.json(extractNotice(input));
});
benefitsRouter.post("/admin/feeds/bizinfo/run",async(_req,res)=>res.json(await runBizinfoFeed()));
// AI 공고 정리: 바로 시작만 하고 진행 상황은 /admin/ai/status 로 본다.
benefitsRouter.post("/admin/ai/run",async(_req,res)=>{
  if(!aiReady()) throw fail("ANTHROPIC_API_KEY 설정이 필요합니다.",409);
  if(!aiJob.running) void runAiStructuring().catch(()=>undefined);
  res.json({...aiJob,running:true});
});
benefitsRouter.get("/admin/ai/status",async(_req,res)=>res.json({ready:aiReady(),...aiJob}));
// 정부24 전체·K-Startup 수집과 중복 정리를 지금 바로 돌린다(결과를 기다리지 않음).
benefitsRouter.post("/admin/feeds/all/run",async(req,res)=>{
  // kstartup-archive: 작년(또는 body.year) 마감 공고를 모아 '놓친 지원금'을 채운다.
  const which=z.enum(["all","gov24","kstartup","kstartup-archive","dedupe"]).default("all").parse(req.body?.source);
  const year=z.coerce.number().int().min(2015).max(new Date().getFullYear()-1).default(new Date().getFullYear()-1).parse(req.body?.year??undefined);
  const job=which==="gov24"?runGov24Bulk(fetch,true):which==="kstartup"?runKstartup():which==="kstartup-archive"?runKstartup(fetch,{archiveYear:year}):which==="dedupe"?hideDuplicates():collectAll();
  void Promise.resolve(job).then(async()=>{if(which!=="dedupe"&&which!=="all"&&aiReady()){await runAiStructuring();await hideDuplicates();}}).catch(()=>undefined);
  res.json({started:which});
});
benefitsRouter.get("/admin/feeds/status",async(_req,res)=>res.json({feeds:[await bizinfoStatus(),...await publicFeedStatus(),...await bulkFeedStatus()],ai:{ready:aiReady(),...aiJob}}));
benefitsRouter.post("/admin/feeds/public/run",async(req,res)=>{
  const source=z.enum(["gov24","welfareCentral","welfareLocal"]).parse(req.body?.source);
  res.json(await runPublicFeed(source));
});
async function saveAnnouncement(req:Request,res:Response,isNew:boolean){
  const b=benefitSchema.parse(req.body), id=isNew?b.id:String(req.params.id);
  if(b.id!==id) throw fail("공고 식별자는 변경할 수 없습니다.");
  if(excludedCategory(b)) throw fail("특례보증·보증료·대출 이자지원·대출상품·융자는 등록할 수 없습니다.");
  if(!officialUrl(b.sourceUrl)) throw fail("허용된 공식 HTTPS 출처가 필요합니다.");
  for(const date of [b.startsAt,b.endsAt,b.checkedAt]) if(date && !Number.isFinite(Date.parse(date))) throw fail("날짜 형식을 확인해 주세요.");
  if(b.startsAt && b.endsAt && Date.parse(b.startsAt)>Date.parse(b.endsAt)) throw fail("신청 종료일이 시작일보다 빠릅니다.");
  if(b.reviewStatus==="공개" && !publicBenefit(b)) throw fail("테스트 자료 또는 확인일이 없는 자료는 공개할 수 없습니다.");
  if(isNew && b.reviewStatus==="공개") throw fail("검토대기로 등록한 후 공식 자료를 검토하고 공개해 주세요.");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const previous=(await client.query("SELECT data FROM iroun_benefits WHERE id=$1 FOR UPDATE",[id])).rows[0]?.data;
    if(!isNew && !previous) throw fail("공고를 찾을 수 없습니다.",404);
    if(isNew && previous) throw fail("이미 존재하는 공고입니다.",409);
    if(previous?.isTest&&!b.isTest)throw fail("시험 공고를 운영자료로 바꿀 수 없습니다. 공식 확인 자료를 별도로 등록해 주세요.");
    const sourceKey=normalizeSourceKey(b);
    if(b.reviewStatus==="공개"){
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`${b.agency}|${b.title}`]);
      const duplicate=(await client.query(`SELECT id FROM iroun_benefits WHERE id<>$1 AND data->>'reviewStatus'='공개' AND data->>'isTest'='false' AND
        (data->>'sourceUrl'=$2 OR (data->>'agency'=$3 AND data->>'title'=$4 AND data->>'region'=$5 AND data->>'startsAt'=$6 AND data->>'endsAt'=$7))`,
        [id,b.sourceUrl,b.agency,b.title,b.region,b.startsAt,b.endsAt])).rows[0];
      if(duplicate)throw fail("다른 출처의 같은 공고가 이미 공개되어 있습니다. 기존 공고와 통합·기간·관할을 확인한 후 공개해 주세요.",409);
    }
    if(isNew) await client.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$2,$3)",[id,sourceKey,JSON.stringify(b)]);
    else await client.query("UPDATE iroun_benefits SET data=$2,source_key=$3,updated_at=now() WHERE id=$1",[id,JSON.stringify(b),sourceKey]);
    await audit(userId(req),isNew?"공고 등록":"공고 수정·검토",id,{before:previous??null,after:b},client);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  res.json(b);
}
benefitsRouter.post("/admin/benefits",async(req,res)=>saveAnnouncement(req,res,true));
benefitsRouter.put("/admin/benefits/:id",async(req,res)=>saveAnnouncement(req,res,false));
benefitsRouter.put("/admin/grants/:userId",async(req,res)=>{
  const id=String(req.params.userId), actor=userId(req);
  const input=z.object({reason:z.string().trim().min(3).max(500),expiresAt:z.string().datetime({offset:true}),revoke:z.boolean()}).strict().parse(req.body);
  if(!input.revoke && Date.parse(input.expiresAt)<=Date.now()) throw fail("이용권 종료일은 미래로 설정해 주세요.");
  const target=(await pool.query("SELECT id FROM iroun_accounts WHERE id=$1 AND deleted_at IS NULL",[id])).rows[0];
  if(!target) throw fail("고객을 찾을 수 없습니다.",404);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT id FROM iroun_accounts WHERE id=$1 FOR NO KEY UPDATE",[id]);
    const before=(await client.query("SELECT * FROM iroun_grants WHERE user_id=$1 FOR UPDATE",[id])).rows[0];
    await client.query("INSERT INTO iroun_grants(user_id,expires_at,revoked_at,reason,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,revoked_at=EXCLUDED.revoked_at,reason=EXCLUDED.reason,granted_by=EXCLUDED.granted_by",[id,input.expiresAt,input.revoke?new Date():null,input.reason,actor]);
    await audit(actor,input.revoke?"무상 이용권 회수":"무상 이용권 부여·기간 변경",id,{before:before??null,...input,freeOfCharge:true},client);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  res.json({message:input.revoke?"무상 이용권을 회수했습니다. 유효 구독이 있으면 맞춤 이용은 유지됩니다.":"외부 결제와 무관한 무상 이용권을 저장했습니다."});
});
benefitsRouter.post("/admin/deletions/:id",async(req,res)=>{
  const {rows:[d]}=await pool.query("SELECT * FROM iroun_deletions WHERE id=$1",[String(req.params.id)]);
  if(!d) throw fail("삭제 요청을 찾을 수 없습니다.",404);
  if(d.status!=="삭제 완료"){
    try{await clerkClient.users.deleteUser(d.user_id);}catch(e){if((e as {status?:number}).status!==404) throw e;}
    await eraseAccount(d.user_id,d.id,userId(req));
  }
  res.json({message:"삭제 요청을 처리했습니다."});
});
benefitsRouter.use((err:unknown,req:Request,res:Response,_next:NextFunction)=>{
  const error=err as {status?:number;code?:string;message?:string};
  const status=err instanceof z.ZodError ? 400 : error.code==="23505" ? 409 : error.status??500;
  if(status>=500) req.log.error({err},"이로운혜택 요청 처리 실패");
  res.status(status).set("Cache-Control","no-store").json({message:err instanceof z.ZodError?"입력 정보를 확인해 주세요. 허용되지 않은 항목이나 잘못된 값이 있습니다.":status===409?"같은 기관·식별자의 공고가 이미 있습니다.":status>=500?"요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.":error.message});
});
