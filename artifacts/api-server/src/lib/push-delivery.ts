import { createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { entitlement,publicBenefit,matchBenefit,type Benefit } from "./benefit-domain";
import { pushTestScope } from "./push-test-scope";

const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
function key(){if(!process.env.SESSION_SECRET) throw new Error("기기 토큰 암호화 설정이 필요합니다.");return createHash("sha256").update(process.env.SESSION_SECRET).digest();}
export function encryptToken(token:string){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
  return [iv.toString("base64"),Buffer.concat([cipher.update(token),cipher.final()]).toString("base64"),cipher.getAuthTag().toString("base64")].join(".");
}
function decryptToken(value:string){
  const [iv,data,tag]=value.split(".").map(v=>Buffer.from(v,"base64"));
  const cipher=createDecipheriv("aes-256-gcm",key(),iv!);cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(data!),cipher.final()]).toString();
}
export async function registerDevice(id:string,token:string){
  if(!/^(ExpoPushToken|ExponentPushToken)\[[a-zA-Z0-9_-]+\]$/.test(token)) throw new Error("올바른 기기 알림 토큰이 필요합니다.");
  const digest=hash(token);
  // A device may switch accounts: move only its token, not any customer records.
  await pool.query("INSERT INTO iroun_push_devices(user_id,token_hash,encrypted_token) VALUES($1,$2,$3) ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,encrypted_token=EXCLUDED.encrypted_token,updated_at=now()",[id,digest,encryptToken(token)]);
}
export interface PushMessage {to:string;title:string;body:string;data:{benefitId:string};sound:"default";channelId?:"deadline"}
export interface PushTransport {
  send(messages:PushMessage[]):Promise<{status:"ok"|"error";id?:string;details?:{error?:string}}[]>;
}
export const expoTransport:PushTransport={
  async send(messages){
    if(process.env.IROUN_PUSH_SEND_ENABLED!=="true") throw new Error("푸시 발송은 차단되어 있습니다.");
    const scope=pushTestScope();
    if(!scope||messages.some(m=>m.data.benefitId!==scope.benefitId)) throw new Error("동의한 테스트 계정·공고 범위 설정이 필요합니다.");
    const r=await fetch("https://exp.host/--/api/v2/push/send",{
      method:"POST",headers:{"Content-Type":"application/json",...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},
      body:JSON.stringify(messages),signal:AbortSignal.timeout(15000),
    });
    if(!r.ok) throw new Error("푸시 제공자 접수 실패");
    const body=await r.json() as {data:Awaited<ReturnType<PushTransport["send"]>>};
    if(!Array.isArray(body.data)||body.data.length!==messages.length) throw new Error("푸시 응답을 확인하지 못했습니다.");
    return body.data;
  },
};
export function deadlineTime(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(`${value}T23:59:59.999+09:00`):Date.parse(value);}
/** Recheck consent, access, deletion and source immediately before dispatch. */
export async function deliverDeadlines(transport:PushTransport=expoTransport,onlyUser?:string,now=Date.now(),kind:"deadline"|"personalized"="deadline"){
  if(transport===expoTransport && process.env.IROUN_PUSH_SEND_ENABLED!=="true") return {blocked:true,accepted:0};
  const scope=transport===expoTransport?pushTestScope():null;
  if(transport===expoTransport&&(!scope||(onlyUser&&onlyUser!==scope.userId))) return {blocked:true,accepted:0};
  if(scope)onlyUser=scope.userId;
  const candidates=kind==="deadline"
    ?await pool.query("SELECT t.user_id,t.benefit_id,b.data AS benefit FROM iroun_tracking t JOIN iroun_benefits b ON b.id=t.benefit_id WHERE (t.data->>'deadlineReminder')='true' AND ($1::text IS NULL OR t.user_id=$1)",[onlyUser??null])
    :await pool.query("SELECT a.id AS user_id,b.id AS benefit_id,b.data AS benefit,b.updated_at AS revision FROM iroun_accounts a CROSS JOIN iroun_benefits b WHERE a.deleted_at IS NULL AND (a.preferences->>'personalizedAlerts')='true' AND (b.data->>'reviewStatus')='공개' AND b.updated_at>now()-interval '7 days' AND ($1::text IS NULL OR a.id=$1) AND (($2::boolean AND (b.data->>'isTest')='true') OR (NOT $2::boolean AND (b.data->>'isTest')='false')) AND ($3::text IS NULL OR b.id=$3) AND NOT EXISTS (SELECT 1 FROM iroun_push_jobs j WHERE j.user_id=a.id AND j.benefit_id=b.id AND j.deadline='personalized-'||floor(extract(epoch from b.updated_at)*1000)::bigint::text) ORDER BY b.updated_at DESC LIMIT 500",[onlyUser??null,!!scope||(transport!==expoTransport&&!!onlyUser),scope?.benefitId??null]);
  let accepted=0;
  const eligible=(b:Benefit)=>scope
    ? b.id===scope.benefitId&&b.isTest&&publicBenefit({...b,isTest:false})
    :publicBenefit(b)||(transport!==expoTransport&&!!onlyUser&&b.isTest&&publicBenefit({...b,isTest:false}));
  for(const row of candidates.rows){
    if(scope&&row.user_id!==scope.userId)continue;
    const b=row.benefit as Benefit,deadline=deadlineTime(b.endsAt);
    if(!eligible(b)||b.budgetStatus==="소진"||b.status==="마감")continue;
    if(kind==="deadline"&&(!Number.isFinite(deadline)||deadline<=now||deadline-now>3*86400000))continue;
    if(kind==="personalized"&&b.endsAt&&Number.isFinite(deadline)&&deadline<=now)continue;
    const queueDeadline=kind==="deadline"?b.endsAt:`personalized-${row.revision.getTime()}`;
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const a=(await client.query("SELECT * FROM iroun_accounts WHERE id=$1 FOR NO KEY UPDATE",[row.user_id])).rows[0];
      const s=(await client.query("SELECT * FROM iroun_subscriptions WHERE user_id=$1",[row.user_id])).rows[0];
      const g=(await client.query("SELECT * FROM iroun_grants WHERE user_id=$1",[row.user_id])).rows[0];
      const pending=(await client.query("SELECT id FROM iroun_deletions WHERE user_id=$1 AND status<>'삭제 완료'",[row.user_id])).rowCount;
      const extra=(await client.query("SELECT EXISTS(SELECT 1 FROM iroun_trials WHERE user_id=$1 AND started_at<=$2 AND ends_at>$2) OR EXISTS(SELECT 1 FROM iroun_contracts WHERE user_id=$1 AND revoked_at IS NULL AND starts_at<=$2 AND ends_at>$2) AS active",[row.user_id,new Date(now)])).rows[0];
      const consent=(await client.query("SELECT accepted FROM iroun_consents WHERE user_id=$1 AND kind='service' ORDER BY id DESC LIMIT 1",[row.user_id])).rows[0];
      const allowed=a&&!a.deleted_at&&!pending&&a.preferences.notifications&&consent?.accepted!==false&&
        (entitlement(s&&{expiresAt:s.expires_at.toISOString(),state:s.state},g&&{expiresAt:g.expires_at.toISOString(),revoked:!!g.revoked_at},now).active||extra?.active);
      if(!allowed){await client.query("COMMIT");continue;}
      const current=(await client.query("SELECT data FROM iroun_benefits WHERE id=$1 FOR SHARE",[b.id])).rows[0]?.data as Benefit|undefined;
      if(!current||!eligible(current)||current.endsAt!==b.endsAt||current.status==="마감"||current.budgetStatus==="소진"){await client.query("COMMIT");continue;}
      if(kind==="deadline"){
        const tracking=(await client.query("SELECT data FROM iroun_tracking WHERE user_id=$1 AND benefit_id=$2",[row.user_id,b.id])).rows[0]?.data;
        if(!tracking?.deadlineReminder){await client.query("COMMIT");continue;}
      }else if(!a.preferences.personalizedAlerts||!a.preferences.privacyConsent||!matchBenefit(current,a.profile).some(r=>r.result!=="대상 제외")){
        await client.query("COMMIT");continue;
      }
      const devices=(await client.query("SELECT token_hash,encrypted_token FROM iroun_push_devices WHERE user_id=$1",[row.user_id])).rows;
      if(!devices.length){await client.query("COMMIT");continue;}
      // Durable claim in a separate transaction. If the process crashes after
      // sending, a restarted worker will not automatically send the same job.
      const job=await pool.query("INSERT INTO iroun_push_jobs(id,user_id,benefit_id,deadline,status) VALUES($1,$2,$3,$4,'sending') ON CONFLICT(user_id,benefit_id,deadline) DO NOTHING RETURNING id",[randomUUID(),row.user_id,b.id,queueDeadline]);
      if(!job.rowCount){await client.query("COMMIT");continue;}
      // Generic wording: never include income, matching reasons or personal amounts.
      const messages=devices.map(d=>({to:decryptToken(d.encrypted_token),title:kind==="deadline"?"관심 혜택 마감 안내":"새 혜택 확인 안내",body:kind==="deadline"?"저장한 혜택의 신청기간이 가까워졌습니다. 공식 접수상태를 다시 확인해 주세요.":"확인해 볼 새 혜택이 있습니다. 앱에서 조건과 공식 접수상태를 확인해 주세요.",data:{benefitId:b.id},sound:"default" as const,channelId:"deadline" as const}));
      // Hold the account row lock so revocation/consent/deletion commits cannot
      // race the authorization check. Already accepted pushes cannot be recalled.
      const tickets=await transport.send(messages);
      const ok=tickets.filter(t=>t.status==="ok"&&t.id);
      for(let i=0;i<tickets.length;i++) if(tickets[i]?.details?.error==="DeviceNotRegistered") await client.query("DELETE FROM iroun_push_devices WHERE token_hash=$1",[devices[i].token_hash]);
      await client.query("UPDATE iroun_push_jobs SET status=$2,ticket_ids=$3,updated_at=now() WHERE id=$1",[job.rows[0].id,ok.length?"provider_accepted":"provider_rejected",JSON.stringify(tickets.flatMap((t,i)=>t.status==="ok"&&t.id?[{id:t.id,tokenHash:devices[i].token_hash}]:[]))]);
      accepted+=ok.length;
      await client.query("COMMIT");
    }catch{
      await client.query("ROLLBACK");
      // Unknown delivery outcome: persist a non-retryable marker to prevent duplicates.
      await pool.query("INSERT INTO iroun_push_jobs(id,user_id,benefit_id,deadline,status) VALUES($1,$2,$3,$4,'delivery_unknown') ON CONFLICT(user_id,benefit_id,deadline) DO UPDATE SET status='delivery_unknown'",[randomUUID(),row.user_id,b.id,queueDeadline]);
    }finally{client.release();}
  }
  return {blocked:false,accepted};
}
/** Provider receipt != notification read/seen by the customer. */
export async function checkPushReceipts(fetcher:typeof fetch=fetch,onlyUser?:string){
  if(process.env.IROUN_PUSH_SEND_ENABLED!=="true") return {blocked:true,confirmed:0};
  const jobs=(await pool.query("SELECT * FROM iroun_push_jobs WHERE status='provider_accepted' AND updated_at<now()-interval '15 minutes' AND ($1::text IS NULL OR user_id=$1) LIMIT 200",[onlyUser??null])).rows;
  if(!jobs.length) return {blocked:false,confirmed:0};
  const ids=jobs.flatMap(j=>(j.ticket_ids as {id:string}[]).map(t=>t.id)).slice(0,1000);
  const r=await fetcher("https://exp.host/--/api/v2/push/getReceipts",{
    method:"POST",headers:{"Content-Type":"application/json",...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},
    body:JSON.stringify({ids}),signal:AbortSignal.timeout(15000),
  });
  if(!r.ok) throw new Error("푸시 제공자 처리 결과를 확인하지 못했습니다.");
  const body=await r.json() as {data:Record<string,{status:string;details?:{error?:string}}>};
  let confirmed=0;
  for(const job of jobs){
    const tickets=job.ticket_ids as {id:string;tokenHash:string}[];
    const results=tickets.map(t=>body.data[t.id]);
    for(const t of tickets) if(body.data[t.id]?.details?.error==="DeviceNotRegistered") await pool.query("DELETE FROM iroun_push_devices WHERE token_hash=$1",[t.tokenHash]);
    const status=results.every(t=>t?.status==="ok")?"provider_confirmed":results.every(Boolean)?"provider_error":"provider_accepted";
    await pool.query("UPDATE iroun_push_jobs SET status=$2,updated_at=now() WHERE id=$1",[job.id,status]);
    if(status==="provider_confirmed")confirmed++;
  }
  return {blocked:false,confirmed};
}
