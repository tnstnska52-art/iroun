import {beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {pool} from "@workspace/db";
import {account} from "./benefit-store";
import {benefitSchema,excludedCategory,noticeTime,normalizeSourceKey} from "./benefit-domain";
import {billingConfig,verifyCustomer,validWebhookAuthorization,syncCustomer} from "./store-provider";
import {applyStoreEvent,type VerifiedSubscription} from "./subscription-verification";
import {bizinfoFeedConfiguration,parseBizinfoRecord,runBizinfoFeed} from "./official-feed";
import {deliverDeadlines,registerDevice,checkPushReceipts,type PushTransport} from "./push-delivery";

const suffix=randomUUID().replaceAll("-",""),uid=`qa-service-${suffix}`,other=`qa-other-${suffix}`;
const sourceId=`PBLN_TEST_${suffix}`,benefitId=`bizinfo-${sourceId}`;
const future=()=>new Date(Date.now()+3600000).toISOString(),past=()=>new Date(Date.now()-3600000).toISOString();
const raw={pblancId:sourceId,pblancNm:"검증용 장비 지원(대출·보증료 제외)",jrsdInsttNm:"검증용 기관",
 pblancUrl:`https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${sourceId}`,
 bsnsSumryCn:"<p>시험 자료: 사업 내용과 요건 원문 검토 필요</p>",reqstBeginEndDe:"20260101 ~ 20261231",pldirSportRealmLclasCodeNm:"경영"};
function approveBizinfo(){
 vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","true");vi.stubEnv("BIZINFO_API_APPROVED","true");
 vi.stubEnv("BIZINFO_TERMS_APPROVED","true");vi.stubEnv("BIZINFO_API_KEY","test-placeholder");
 vi.stubEnv("IROUN_BIZINFO_APPROVED_SCOPE","시험용 기업마당 공고정보 API 수집범위");
 vi.stubEnv("IROUN_FEED_INTERVAL_MINUTES","60");vi.stubEnv("IROUN_BIZINFO_MAX_PAGES","1");
}
const fetchJson=(body:unknown)=>vi.fn(async()=>new Response(JSON.stringify(body),{status:200})) as unknown as typeof fetch;
function provider(overrides:Record<string,unknown>={},id=uid){
 return {request_date_ms:Date.now(),subscriber:{original_app_user_id:id,entitlements:{personal:{product_identifier:"apple.monthly",expires_date:future()}},
  subscriptions:{"apple.monthly":{expires_date:future(),is_sandbox:true,store:"app_store",store_transaction_id:`test-${uid}`,unsubscribe_detected_at:null,refunded_at:null,...overrides}}}};
}
const verified=(state:VerifiedSubscription["state"],at=Date.now(),customerId=uid):VerifiedSubscription=>({
 customerId,platform:"apple",transactionId:`test-${uid}`,expiresAt:state==="expired"?past():future(),state,verifiedAt:new Date(at).toISOString(),
});
beforeAll(async()=>{
 for(const id of [uid,other])await pool.query("INSERT INTO iroun_accounts(id,preferences) VALUES($1,$2)",[id,JSON.stringify({notifications:true,personalizedAlerts:true,privacyConsent:true})]);
});
beforeEach(async()=>{
 vi.stubEnv("IROUN_BILLING_MODE","sandbox");vi.stubEnv("REVENUECAT_SECRET_API_KEY","test-placeholder");
 vi.stubEnv("REVENUECAT_WEBHOOK_SECRET","test-placeholder");vi.stubEnv("IROUN_REVENUECAT_ENTITLEMENT","personal");
 vi.stubEnv("IROUN_APPLE_MONTHLY_PRODUCT","apple.monthly");vi.stubEnv("IROUN_GOOGLE_MONTHLY_PRODUCT","google.monthly");
 await pool.query("DELETE FROM iroun_push_jobs WHERE user_id=$1",[uid]);
 await pool.query("DELETE FROM iroun_subscriptions WHERE user_id=ANY($1::text[])",[[uid,other]]);
 await pool.query("DELETE FROM iroun_billing_sync WHERE user_id=ANY($1::text[])",[[uid,other]]);
 await pool.query("DELETE FROM iroun_billing_transactions WHERE user_id=ANY($1::text[])",[[uid,other]]);
 await pool.query("DELETE FROM iroun_grants WHERE user_id=$1",[uid]);
 await pool.query("DELETE FROM iroun_deletions WHERE user_id=$1",[uid]);
 await pool.query("UPDATE iroun_accounts SET deleted_at=NULL,preferences=$2 WHERE id=$1",[uid,JSON.stringify({notifications:true,personalizedAlerts:true,privacyConsent:true})]);
});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{
 await pool.query("DELETE FROM iroun_audit WHERE actor=ANY($1::text[]) OR subject=ANY($2::text[])",[[uid,other],[uid,other,benefitId]]);
 await pool.query("DELETE FROM iroun_deletions WHERE user_id=ANY($1::text[])",[[uid,other]]);
 await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])",[[uid,other]]);
 await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[benefitId]);
 await pool.query("DELETE FROM iroun_feed_snapshots WHERE source_id=$1",[sourceId]);await pool.end();
});
describe("스토어 실제 HTTP/구매 없이 공식 응답 계약·권한 저장 검증",()=>{
 it("미연결이면 조회·복원 호출 차단",async()=>{
  vi.stubEnv("REVENUECAT_SECRET_API_KEY","");const fetcher=fetchJson(provider());
  expect(billingConfig().configured).toBe(false);await expect(verifyCustomer(uid,fetcher)).rejects.toThrow("설정");expect(fetcher).not.toHaveBeenCalled();
 });
 it.each(["app_store","play_store"])("정식 %s 월구독만 허용",async(store)=>{
  const body=provider({store});
  if(store==="play_store"){Object.assign(body.subscriber.subscriptions,{"google.monthly":body.subscriber.subscriptions["apple.monthly"]});body.subscriber.entitlements.personal.product_identifier="google.monthly";}
  expect((await verifyCustomer(uid,fetchJson(body))).platform).toBe(store==="app_store"?"apple":"google");
 });
 it.each(["promotional","stripe","rc_billing","test_store"])("%s 결제/무상권을 구독으로 인정 안함",async(store)=>await expect(verifyCustomer(uid,fetchJson(provider({store})))).rejects.toThrow("정식 월구독"));
 it("타 고객 원래 구매 계정이면 차단",async()=>await expect(verifyCustomer(uid,fetchJson(provider({},other)))).rejects.toThrow("다른 계정"));
 it("시험/운영 혼합 차단",async()=>await expect(verifyCustomer(uid,fetchJson(provider({is_sandbox:false})))).rejects.toThrow("환경"));
 it.each([
  [{unsubscribe_detected_at:past()},"cancelled"],[{refunded_at:past()},"refunded"],[{expires_date:past()},"expired"],[{},"active"],
 ] as const)("취소/환불/만료/활성 응답 판정 %#",async(overrides,state)=>expect((await verifyCustomer(uid,fetchJson(provider(overrides)))).state).toBe(state));
 it("취소는 납부기간까지 유효; 환불은 차단",async()=>{
  const at=Date.now();
  await applyStoreEvent({verify:async()=>verified("cancelled",at)},null);expect((await account(uid)).entitlement.active).toBe(true);
  await applyStoreEvent({verify:async()=>verified("refunded",at+1)},null);expect((await account(uid)).entitlement.active).toBe(false);
 });
 it("오래된 갱신 응답·중복이 환불 후 권한을 되살리지 않음",async()=>{
  const at=Date.now();await applyStoreEvent({verify:async()=>verified("refunded",at+10)},null);
  expect((await applyStoreEvent({verify:async()=>verified("active",at)},null)).applied).toBe(false);
  expect((await account(uid)).entitlement.active).toBe(false);
 });
 it("구독 환불 후 유효 무상권은 독립 유지",async()=>{
  await pool.query("INSERT INTO iroun_grants(user_id,expires_at,reason,granted_by) VALUES($1,$2,'검증용 무상권',$1)",[uid,future()]);
  await applyStoreEvent({verify:async()=>verified("refunded")},null);expect((await account(uid)).entitlement.active).toBe(true);
  await pool.query("UPDATE iroun_grants SET revoked_at=now() WHERE user_id=$1",[uid]);expect((await account(uid)).entitlement.active).toBe(false);
 });
 it("이전 거래를 다른 고객에게 재배정 차단",async()=>{
  await applyStoreEvent({verify:async()=>verified("active")},null);
  await expect(applyStoreEvent({verify:async()=>verified("active",Date.now()+1,other)},null)).rejects.toThrow("다른 고객");
 });
 it("삭제 요청 고객의 갱신 권한 차단",async()=>{
  await pool.query("INSERT INTO iroun_deletions(id,user_id) VALUES($1,$2)",[randomUUID(),uid]);
  await expect(applyStoreEvent({verify:async()=>verified("active")},null)).rejects.toThrow("삭제 요청");
 });
 it("검증기관 비밀 인증 없는 웹훅 차단",()=>{expect(validWebhookAuthorization(undefined)).toBe(false);expect(validWebhookAuthorization("Bearer incorrect")).toBe(false);expect(validWebhookAuthorization("Bearer test-placeholder")).toBe(true);});
 it("서버 조회로만 권한 반영",async()=>expect((await syncCustomer(uid,fetchJson(provider()))).active).toBe(true));
});
describe("공식 API 수집 준비: 외부 호출 없이 문서 계약과 시험 분리",()=>{
 it("승인·이용조건·범위·키 중 하나라도 없으면 수집 호출 0",async()=>{
  approveBizinfo();vi.stubEnv("BIZINFO_API_KEY","");vi.stubEnv("BIZINFO_API_APPROVED","false");
  const f=fetchJson({jsonArray:[raw]});expect((await runBizinfoFeed(f,true)).blocked).toBe(true);expect(f).not.toHaveBeenCalled();
 });
 it("수집 승인이 있어도 이용조건·수집범위·주기를 각각 확인",()=>{
  approveBizinfo();
  expect(bizinfoFeedConfiguration().ready).toBe(true);
  expect(bizinfoFeedConfiguration({...process.env,BIZINFO_TERMS_APPROVED:"false"}).ready).toBe(false);
  expect(bizinfoFeedConfiguration({...process.env,IROUN_BIZINFO_APPROVED_SCOPE:""}).ready).toBe(false);
  expect(bizinfoFeedConfiguration({...process.env,IROUN_FEED_INTERVAL_MINUTES:"2"}).ready).toBe(false);
  expect(bizinfoFeedConfiguration({...process.env,IROUN_BIZINFO_MAX_PAGES:"11"}).ready).toBe(false);
 });
 it("공식 응답을 검토대기·예산미확인·시험 표시로 변환",()=>{
  const b=parseBizinfoRecord(raw,new Date().toISOString(),true);
  expect(b.isTest).toBe(true);expect(b.reviewStatus).toBe("검토대기");expect(b.budgetStatus).toBe("확인 필요");expect(b.region).toBe("관할 확인 필요");expect(b.support).not.toContain("<p>");
 });
 it("가짜 출처/유효하지 않은 식별자 차단",()=>{
  expect(()=>parseBizinfoRecord({...raw,pblancUrl:"https://unofficial.example/page"})).toThrow("공식");
  expect(()=>parseBizinfoRecord({...raw,pblancId:""})).toThrow("식별자");
 });
 it.each(["특례보증","보증료 지원","대출 이자 지원","신규 대출 추천","융자 지원"])("%s 제외",title=>expect(excludedCategory({title,category:"경영"})).toBe(true));
 it("다른 조건의 제외 언급이 실제 대출을 숨기지 않음",()=>expect(excludedCategory({title:"창업 대출 상품(일부 업종 제외)",category:"경영"})).toBe(true));
 it.each(["장비 지원(대출·보증료 제외)","대출 없이 창업 장비 지원","시설 지원 대출 제외","교육 지원"])("정상지원 %s 오제외 방지",title=>expect(excludedCategory({title,category:"경영"})).toBe(false));
 it("주기 재호출은 동일 자료를 재검토로 덮어쓰지 않고 변경만 보류",async()=>{
  approveBizinfo();
  const curated=benefitSchema.parse({
   ...parseBizinfoRecord(raw,new Date().toISOString(),true),
   title:"운영자 확인 제목",summary:"운영자가 직접 보완한 안내",region:"전주시",
   status:"접수 중",budgetStatus:"해당 없음",reviewStatus:"공개",
   rules:[
    {scope:"business",field:"industry",operator:"eq",value:"음식점",label:"사업 업종"},
    {scope:"personal",field:"household",operator:"eq",value:"한부모",label:"가구 자격"},
   ],
  });
  await pool.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$2,$3)",[benefitId,normalizeSourceKey(curated),JSON.stringify(curated)]);
  const f=fetchJson({jsonArray:[raw]});expect((await runBizinfoFeed(f,true)).staged).toBe(1);
  let rows=(await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[benefitId])).rows;
  expect(rows[0].data.summary).toBe("운영자가 직접 보완한 안내");
  expect(rows[0].data.region).toBe("전주시");
  expect(rows[0].data.reviewStatus).toBe("공개"); // First observation is only a baseline.
  expect((await runBizinfoFeed(f,true)).unchanged).toBe(1);
  expect((await runBizinfoFeed(fetchJson({jsonArray:[{...raw,jrsdInsttNm:"변경 기관",bsnsSumryCn:"변경 내용"}]}),true)).staged).toBe(1);
  rows=(await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[benefitId])).rows;
  expect(rows).toHaveLength(1);expect(rows[0].data.reviewStatus).toBe("검토대기");
  expect(rows[0].data.status).toBe("확인 필요");expect(rows[0].data.budgetStatus).toBe("확인 필요");
  expect(rows[0].data.summary).toBe("운영자가 직접 보완한 안내");expect(rows[0].data.region).toBe("전주시");
  expect(rows[0].data.rules).toHaveLength(2);expect(rows[0].data.rules[1].scope).toBe("personal");
  expect(rows[0].data.isTest).toBe(true);
  const latest=(await pool.query("SELECT data FROM iroun_audit WHERE subject=$1 ORDER BY id DESC LIMIT 1",[benefitId])).rows[0].data;
  expect(latest.proposed.summary).toBe("변경 내용");expect(latest.sourceRecord.reqstBeginEndDe).toBe("20260101 ~ 20261231");
 });
 it("한국 날짜 공고는 마감일 23:59:59.999까지",()=>expect(noticeTime("2026-10-10","end")).toBe(Date.parse("2026-10-10T23:59:59.999+09:00")));
});
describe("푸시: 시험 수신기에만 발송, 실제 제공자 호출 0",()=>{
 async function prepare(){
  const b=benefitSchema.parse({...parseBizinfoRecord(raw,new Date().toISOString(),true),region:"전국",reviewStatus:"공개",endsAt:future(),status:"접수 중",budgetStatus:"해당 없음"});
  await pool.query("UPDATE iroun_accounts SET profile=$2 WHERE id=$1",[uid,JSON.stringify({personal:{},businesses:[{id:"test-business",province:"경남"}],step:8})]);
  await pool.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",[benefitId,JSON.stringify(b)]);
  await pool.query("INSERT INTO iroun_tracking(user_id,benefit_id,data) VALUES($1,$2,$3) ON CONFLICT(user_id,benefit_id) DO UPDATE SET data=EXCLUDED.data",[uid,benefitId,JSON.stringify({saved:true,deadlineReminder:true})]);
  await pool.query("INSERT INTO iroun_grants(user_id,expires_at,reason,granted_by) VALUES($1,$2,'검증용 무상권',$1)",[uid,future()]);
  await registerDevice(uid,`ExpoPushToken[test_${suffix}]`);
  const send=vi.fn(async(messages:unknown[])=>messages.map((_,i)=>({status:"ok" as const,id:`test-ticket-${i}`})));
  return {send,transport:{send} as PushTransport};
 }
 it("기본 운영 발송 차단",async()=>expect((await deliverDeadlines()).blocked).toBe(true));
 it("토큰은 평문 아닌 암호화 저장",async()=>{
  await prepare();const r=(await pool.query("SELECT encrypted_token FROM iroun_push_devices WHERE user_id=$1",[uid])).rows[0];
  expect(r.encrypted_token).not.toContain("ExpoPushToken[");expect(r.encrypted_token.split(".")).toHaveLength(3);
 });
 it("동의·무상권·마감 조건 충족하면 시험 전송; 중복 차단",async()=>{
  const {send,transport}=await prepare();
  expect((await deliverDeadlines(transport,uid)).accepted).toBe(1);
  expect((await deliverDeadlines(transport,uid)).accepted).toBe(0);expect(send).toHaveBeenCalledTimes(1);
  expect((await pool.query("SELECT status FROM iroun_push_jobs WHERE user_id=$1",[uid])).rows[0].status).toBe("provider_accepted");
 });
 it.each(["consent","revoked","expired","deleted","deletionPending","closed","deadlinePassed"])("%s이면 발송 차단",async(kind)=>{
  const {send,transport}=await prepare();
  if(kind==="consent")await pool.query("UPDATE iroun_accounts SET preferences=jsonb_set(preferences,'{notifications}','false') WHERE id=$1",[uid]);
  if(kind==="revoked")await pool.query("UPDATE iroun_grants SET revoked_at=now() WHERE user_id=$1",[uid]);
  if(kind==="expired")await pool.query("UPDATE iroun_grants SET expires_at=now()-interval '1 hour' WHERE user_id=$1",[uid]);
  if(kind==="deleted")await pool.query("UPDATE iroun_accounts SET deleted_at=now() WHERE id=$1",[uid]);
  if(kind==="deletionPending")await pool.query("INSERT INTO iroun_deletions(id,user_id) VALUES($1,$2)",[randomUUID(),uid]);
  if(kind==="closed")await pool.query("UPDATE iroun_benefits SET data=jsonb_set(data,'{status}','\"마감\"') WHERE id=$1",[benefitId]);
  if(kind==="deadlinePassed")await pool.query("UPDATE iroun_benefits SET data=jsonb_set(data,'{endsAt}',to_jsonb($2::text)) WHERE id=$1",[benefitId,past()]);
  await deliverDeadlines(transport,uid);expect(send).not.toHaveBeenCalled();
 });
 it.each(["free","expired"])("맞춤 알림은 %s 회원에게 발송하지 않음",async(access)=>{
  const {send,transport}=await prepare();
  if(access==="free")await pool.query("DELETE FROM iroun_grants WHERE user_id=$1",[uid]);
  else await pool.query("UPDATE iroun_grants SET expires_at=now()-interval '1 hour' WHERE user_id=$1",[uid]);
  await deliverDeadlines(transport,uid,Date.now(),"personalized");
  expect(send).not.toHaveBeenCalled();
 });
 it("전송 결과 불명은 자동 재발송하지 않음",async()=>{
  const {transport}=await prepare();transport.send=vi.fn(async()=>{throw new Error("test timeout");});
  await deliverDeadlines(transport,uid);await deliverDeadlines(transport,uid);expect(transport.send).toHaveBeenCalledTimes(1);
  expect((await pool.query("SELECT status FROM iroun_push_jobs WHERE user_id=$1",[uid])).rows[0].status).toBe("delivery_unknown");
 });
 it("맞춤 신규 공고도 별도 동의·조건 비교·중복 방지",async()=>{
  const {transport,send}=await prepare();
  expect((await deliverDeadlines(transport,uid,Date.now(),"personalized")).accepted).toBe(1);
  expect((await deliverDeadlines(transport,uid,Date.now(),"personalized")).accepted).toBe(0);
  expect(send).toHaveBeenCalledTimes(1);
  await pool.query("DELETE FROM iroun_push_jobs WHERE user_id=$1",[uid]);
  await pool.query("UPDATE iroun_accounts SET preferences=jsonb_set(preferences,'{personalizedAlerts}','false') WHERE id=$1",[uid]);
  await deliverDeadlines(transport,uid,Date.now(),"personalized");expect(send).toHaveBeenCalledTimes(1);
 });
 it("시험 제공자 접수증은 고객 읽음으로 표시하지 않음",async()=>{
  const {transport}=await prepare();await deliverDeadlines(transport,uid);
  await pool.query("UPDATE iroun_push_jobs SET updated_at=now()-interval '16 minutes' WHERE user_id=$1",[uid]);
  vi.stubEnv("IROUN_PUSH_SEND_ENABLED","true");
  expect((await checkPushReceipts(fetchJson({data:{"test-ticket-0":{status:"ok"}}}),uid)).confirmed).toBe(1);
  expect((await pool.query("SELECT status FROM iroun_push_jobs WHERE user_id=$1",[uid])).rows[0].status).toBe("provider_confirmed");
 });
});
