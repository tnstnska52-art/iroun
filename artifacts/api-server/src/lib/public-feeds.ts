import {createHash} from "node:crypto";
import {pool} from "@workspace/db";
import {excludedCategory} from "./benefit-domain";
import {refreshOfficialCheck,stageOfficialNotice} from "./official-ingestion";
import {catalog,mapPublicBenefit,parseWelfareXml,rows,text,type PublicFeed,type Row} from "./public-feed-model";
let schema:Promise<unknown>|undefined;
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object"){
    const record=value as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value)??"null";
}
function tables(){
  return schema??=pool.query(`CREATE TABLE IF NOT EXISTS iroun_public_feed_state(source text PRIMARY KEY,data jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS iroun_public_feed_quota(source text NOT NULL,day date NOT NULL,calls integer NOT NULL,PRIMARY KEY(source,day));`).catch(e=>{schema=undefined;throw e;});
}
export async function storedFeedState(source:string){
  await tables();
  return (await pool.query("SELECT data FROM iroun_public_feed_state WHERE source=$1",[source])).rows[0]?.data??{};
}
export async function storeFeedState(source:string,data:unknown){
  await tables();
  await pool.query("INSERT INTO iroun_public_feed_state(source,data) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET data=EXCLUDED.data",[source,JSON.stringify(data)]);
}
export async function reserveFeedCall(source:string,limit:number){
  await tables();
  return !!(await pool.query(`INSERT INTO iroun_public_feed_quota(source,day,calls) VALUES($1,(now() AT TIME ZONE 'Asia/Seoul')::date,1)
    ON CONFLICT(source,day) DO UPDATE SET calls=iroun_public_feed_quota.calls+1 WHERE iroun_public_feed_quota.calls<$2 RETURNING calls`,[source,limit])).rowCount;
}
export function publicFeedScheduleReady(source:PublicFeed){
  const limit=Number(process.env[`IROUN_${source.toUpperCase()}_DAILY_LIMIT`]);
  return !!(process.env[catalog[source].key]||process.env.DATA_GO_KR_SERVICE_KEY)
    &&process.env.IROUN_OFFICIAL_FEEDS_ENABLED==="true"
    &&process.env[`IROUN_${source.toUpperCase()}_APPROVED`]==="true"
    &&Number.isInteger(limit)&&limit>0;
}
export async function publicFeedStatus(){
  await tables();
  const saved=(await pool.query("SELECT source,data FROM iroun_public_feed_state")).rows;
  return Object.entries(catalog).map(([id,c])=>{
    const data=saved.find(s=>s.source===id)?.data??{};
    const configured=!!(process.env[c.key]||process.env.DATA_GO_KR_SERVICE_KEY);
    return {name:c.name,source:id,documentation:c.doc,...data,
      status:!configured||process.env.IROUN_OFFICIAL_FEEDS_ENABLED!=="true"||process.env[`IROUN_${id.toUpperCase()}_APPROVED`]!=="true"?"미연동":data.status??"아직 수집하지 않음",
      keyConfigured:configured,publishedDefaultDailyMaximum:c.limit,
      approvedDailyMaximum:null,
      configuredDailyLimit:Number(process.env[`IROUN_${id.toUpperCase()}_DAILY_LIMIT`])||null,
      scheduleReady:publicFeedScheduleReady(id as PublicFeed),
      quotaNotice:"기관 기본 안내와 계정별 승인 한도는 다릅니다. 계정별 승인 한도는 별도 확인 필요합니다. 개발 서버가 멈추면 주기수집도 멈춥니다.",
      coverage:"주기마다 목록 1쪽·상세 최대 2건. 전국·전체기간 수집 완료 아님.",
      reason:!configured?"승인된 활용키 없음. 호출 차단":data.reason??"운영자 승인·공식 호출·검토가 필요합니다."};
  });
}
export async function runPublicFeed(source:PublicFeed,fetcher:typeof fetch=fetch,testMode=false){
  const c=catalog[source],stateKey=testMode?`${source}:test`:source;
  await tables();
  let key=process.env[c.key]||process.env.DATA_GO_KR_SERVICE_KEY;
  if(!key||process.env.IROUN_OFFICIAL_FEEDS_ENABLED!=="true"||process.env[`IROUN_${source.toUpperCase()}_APPROVED`]!=="true")return {blocked:true,staged:0,reason:"해당 서비스 활용승인·인증키·수집 승인 설정 필요"};
  try{key=decodeURIComponent(key);}catch{throw new Error("공식 인증키 저장 형식 확인 필요");}
  const client=await pool.connect(),lock=84000+Object.keys(catalog).indexOf(source);
  let acquired=false;
  const prior=(await pool.query("SELECT data FROM iroun_public_feed_state WHERE source=$1",[stateKey])).rows[0]?.data??{};
  const state={...prior,lastAttempt:new Date().toISOString(),staged:0,created:0,updated:0,unchanged:0,excluded:0,invalid:0,status:"확인 중",reason:"자동 공개하지 않습니다."};
  const save=()=>pool.query("INSERT INTO iroun_public_feed_state(source,data) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET data=EXCLUDED.data",[stateKey,JSON.stringify(state)]);
  try{
    acquired=(await client.query("SELECT pg_try_advisory_lock($1) AS ok",[lock])).rows[0]?.ok;
    if(!acquired)return {busy:true,blocked:false,staged:0};
    const page=Number(prior.nextPage)||1;
    const daily=Math.min(c.limit,Math.max(1,Number(process.env[`IROUN_${source.toUpperCase()}_DAILY_LIMIT`])||c.limit));
    async function read(path:string,params:Record<string,string>,allowEmpty=false):Promise<Row>{
      const reserved=await pool.query(`INSERT INTO iroun_public_feed_quota(source,day,calls) VALUES($1,(now() AT TIME ZONE 'Asia/Seoul')::date,1)
        ON CONFLICT(source,day) DO UPDATE SET calls=iroun_public_feed_quota.calls+1 WHERE iroun_public_feed_quota.calls<$2 RETURNING calls`,[stateKey,daily]);
      if(!reserved.rowCount)throw new Error("오늘 승인된 호출 한도 도달");
      const url=new URL(path,c.base);
      url.search=new URLSearchParams({...params,serviceKey:key!}).toString();
      const r=await fetcher(url,{signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error("공식 제공자 HTTP 실패");
      const body=await r.text();
      if(body.length>2000000)throw new Error("공식 응답 크기 초과");
      if(source==="gov24"){
        const parsed=JSON.parse(body);
        if(!Array.isArray(parsed.data)||(!allowEmpty&&!parsed.data.length))throw new Error("공식 자료 없음 또는 응답 형식 오류");
        return parsed;
      }
      return parseWelfareXml(body,path.includes("detailed"));
    }
    const listing=source==="gov24"
      ?await read("serviceList",{page:String(page),perPage:"2",returnType:"JSON"})
      :await read(source==="welfareCentral"?"NationalWelfarelistV001":"LcgvWelfarelist",
        {pageNo:String(page),numOfRows:"2",srchKeyCode:"003",...(source==="welfareCentral"?{callTp:"L"}:{})});
    const list=rows(source==="gov24"?listing.data:listing.servList);
    if(!list.length)throw new Error("공식 목록이 비었습니다.");
    for(const item of list.slice(0,2)){
      const id=text(source==="gov24"?item["서비스ID"]:item.servId);
      if(!id){state.invalid++;continue;}
      const detail=source==="gov24"
        ?rows((await read("serviceDetail",{"cond[서비스ID::EQ]":id,page:"1",perPage:"1",returnType:"JSON"})).data)[0]!
        :await read(source==="welfareCentral"?"NationalWelfaredetailedV001":"LcgvWelfaredetailed",
          {servId:id,...(source==="welfareCentral"?{callTp:"D"}:{})});
      const conditions=source==="gov24"?rows((await read("supportConditions",{"cond[서비스ID::EQ]":id,page:"1",perPage:"1",returnType:"JSON"},true)).data)[0]??{}: {};
      if(text(source==="gov24"?detail["서비스ID"]:detail.servId)!==id)throw new Error("공식 상세 식별자가 목록과 다릅니다.");
      if(source==="gov24"&&conditions["서비스ID"]&&text(conditions["서비스ID"])!==id)throw new Error("공식 조건 식별자가 다릅니다.");
      let b;
      try{b=mapPublicBenefit(source,item,detail,conditions,state.lastAttempt,testMode);}catch{state.invalid++;continue;}
      if(excludedCategory(b)){state.excluded++;continue;}
      const sourceRecord={list:item,detail,conditions};
      const fingerprint=createHash("sha256").update(canonical(sourceRecord)).digest("hex");
      const old=(await pool.query("SELECT content_hash FROM iroun_feed_snapshots WHERE source_id=$1",[b.sourceId])).rows[0];
      if(old?.content_hash===fingerprint){
        await refreshOfficialCheck(b.sourceId,b.checkedAt,b.sourceUrl,testMode);
        state.unchanged++;continue;
      }
      const result=await stageOfficialNotice(b,`official-${source}-worker`,{
        sourceRecord,baselineOnly:!old,contentHash:fingerprint,
      });
      if(result.reused)state.updated++;else state.created++;
      state.staged++;
    }
    if(state.invalid)throw new Error("일부 공식 자료에 필수 출처·조건이 누락되었습니다.");
    state.status="검토대기";state.lastSuccess=new Date().toISOString();
    state.nextPage=page*2<Number(listing.totalCount)?page+1:1;
    state.reason="목록·상세·조건 수집 후 운영자 검토대기. 자동 공개하지 않습니다.";
    await save();
    return {blocked:false,...state,automaticallyPublished:false};
  }catch{
    state.status="확인 필요";state.reason="제공자 실패·빈 응답·호출 한도·자료 누락 확인 필요. 이전 최종 성공시각 유지.";
    await save();throw Object.assign(new Error(state.reason),{status:503});
  }finally{if(acquired)await client.query("SELECT pg_advisory_unlock($1)",[lock]);client.release();}
}
