import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { z } from "zod";
import { benefitSchema,excludedCategory,type Benefit } from "./benefit-domain";
import {storedFeedState,storeFeedState,reserveFeedCall} from "./public-feeds";
import { refreshOfficialCheck,stageOfficialNotice } from "./official-ingestion";

export const BIZINFO_DOCUMENTATION="https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi";
export const feedState:{
  status:string;lastAttempt?:string;lastSuccess?:string;staged:number;unchanged:number;
  pagesFetched:number;limited:boolean;reason:string;nextPage?:number;excluded?:number;created?:number;updated?:number;
}={
  status:"미연동",staged:0,unchanged:0,pagesFetched:0,limited:false,
  reason:"공식 API의 운영자 승인·이용조건·수집범위·키·주기 설정 필요",
};
const field=(r:Record<string,unknown>,...keys:string[])=>keys.map(k=>r[k]).find(v=>typeof v==="string") as string|undefined;
const plain=(s:string)=>s.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();

function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if(value && typeof value==="object"){
    const record=value as Record<string,unknown>;
    return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value)??"null";
}
const pageNumber=(value:string|undefined,min:number,max:number)=>{
  if(value===undefined||value==="") return NaN;
  if(!/^\d+$/.test(value)) return NaN;
  const parsed=Number(value);
  return parsed>=min&&parsed<=max?parsed:NaN;
};

export function bizinfoFeedConfiguration(env:NodeJS.ProcessEnv=process.env){
  const interval=pageNumber(env.IROUN_FEED_INTERVAL_MINUTES,15,10080);
  const maxPages=pageNumber(env.IROUN_BIZINFO_MAX_PAGES,1,10);
  const approvedScope=env.IROUN_BIZINFO_APPROVED_SCOPE?.trim()??"";
  const apiKey=env.BIZINFO_API_KEY?.trim()??"";
  const ready=env.IROUN_OFFICIAL_FEEDS_ENABLED==="true"&&
    env.BIZINFO_API_APPROVED==="true"&&env.BIZINFO_TERMS_APPROVED==="true"&&
    !!apiKey&&approvedScope.length>=3&&approvedScope.length<=500&&
    Number.isFinite(interval)&&Number.isFinite(maxPages);
  let reason="기업마당 자동수집 사용 중";
  if(env.IROUN_OFFICIAL_FEEDS_ENABLED!=="true") reason="자동수집 사용 설정이 꺼져 있습니다.";
  else if(env.BIZINFO_API_APPROVED!=="true") reason="기업마당 API 운영 승인 확인이 필요합니다.";
  else if(env.BIZINFO_TERMS_APPROVED!=="true") reason="기업마당 이용조건 확인이 필요합니다.";
  else if(!apiKey) reason="기업마당 인증키가 설정되지 않았습니다.";
  else if(approvedScope.length<3||approvedScope.length>500) reason="운영자가 승인한 수집 범위 설정이 필요합니다.";
  else if(!Number.isFinite(interval)) reason="수집 주기는 15~10080분으로 설정해야 합니다.";
  else if(!Number.isFinite(maxPages)) reason="한 회 최대 페이지는 1~10으로 설정해야 합니다.";
  return {ready,reason,intervalMinutes:interval,maxPages};
}

export function parseBizinfoRecord(value:unknown,checkedAt=new Date().toISOString(),isTest=false):Benefit {
  const r=z.record(z.string(),z.unknown()).parse(value);
  const sourceId=field(r,"pblancId","seq"),title=field(r,"pblancNm","title"),agency=field(r,"jrsdInsttNm","author");
  const rawUrl=field(r,"pblancUrl","link");
  if(!sourceId||!/^PBLN_[A-Z0-9_]+$/i.test(sourceId)||!title||!agency||!rawUrl) throw new Error("공식 응답의 공고 식별자·기관·제목·출처를 확인하지 못했습니다.");
  const url=new URL(rawUrl,"https://www.bizinfo.go.kr");
  if(url.protocol!=="https:"||url.hostname!=="www.bizinfo.go.kr"||url.username||url.password) throw new Error("기업마당 공식 공고 주소가 아닙니다.");
  const period=field(r,"reqstBeginEndDe","reqstDt")??"";
  const dates=[...period.matchAll(/(\d{4})[.-]?(\d{2})[.-]?(\d{2})/g)].map(m=>`${m[1]}-${m[2]}-${m[3]}`);
  const summary=plain(field(r,"bsnsSumryCn","description")??"공식 원문에서 지원 내용과 조건을 확인해 주세요.");
  // Hashtags describe distribution, not necessarily eligibility. Do not infer
  // jurisdiction/industry rules from tags; an operator must review the source.
  return benefitSchema.parse({
    id:`bizinfo-${sourceId}`,title:plain(title),kind:"지원금",audience:"사업",region:"관할 확인 필요",
    category:plain(field(r,"pldirSportRealmLclasCodeNm","lcategory")??"확인 필요"),status:"확인 필요",
    summary:summary.slice(0,1000),support:summary.slice(0,5000),
    calculation:"지원 내용·한도는 공식 공고를 검토해야 합니다. 개인 예상액이나 합산 금액이 아닙니다.",
    checks:["관할 지역·업종·지원대상·중복수혜·접수 여부를 원문에서 검토해야 합니다."],
    documents:[],agency:plain(agency),sourceId,sourceUrl:url.href,
    startsAt:dates[0]??"",endsAt:dates[1]??"",checkedAt,budgetStatus:"확인 필요",reviewStatus:"검토대기",isTest,rules:[],
  });
}
export async function runBizinfoFeed(fetcher:typeof fetch=fetch,testMode=false){
  const stateKey=testMode?"bizinfo:test":"bizinfo";
  Object.assign(feedState,await storedFeedState(stateKey));
  feedState.lastAttempt=new Date().toISOString();
  feedState.staged=0;feedState.unchanged=0;feedState.pagesFetched=0;feedState.limited=false;
  feedState.excluded=0;feedState.created=0;feedState.updated=0;
  const config=bizinfoFeedConfiguration();
  if(!config.ready){
    feedState.status="미연동";feedState.reason=config.reason;feedState.staged=0;feedState.unchanged=0;feedState.pagesFetched=0;feedState.limited=false;
    await storeFeedState(stateKey,feedState);
    return {blocked:true,staged:0,unchanged:0,reason:config.reason};
  }
  const lock=await pool.connect();
  let acquired=false;
  try{
    acquired=(await lock.query("SELECT pg_try_advisory_lock(83417) AS acquired")).rows[0]?.acquired===true;
    if(!acquired) return {blocked:false,busy:true,staged:0,unchanged:0};
    let staged=0,unchanged=0,excluded=0,pagesFetched=0,lastPageLength=0;
    let created=0,updated=0;
    const pageStart=Math.max(1,Number(feedState.nextPage)||1);
    const dailyValue=Number(process.env.IROUN_BIZINFO_DAILY_LIMIT);
    const dailyLimit=Number.isInteger(dailyValue)&&dailyValue>0?Math.min(dailyValue,24):24;
    // This deliberately bounded page window is not a nationwide-completeness claim.
    for(let offset=0;offset<config.maxPages;offset++){
      const pageIndex=pageStart+offset;
      if(!await reserveFeedCall(stateKey,dailyLimit)) throw new Error("오늘 승인된 기업마당 호출 한도에 도달했습니다.");
      const url=new URL("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do");
      url.search=new URLSearchParams({
        crtfcKey:process.env.BIZINFO_API_KEY!.trim(),dataType:"json",searchCnt:"100",pageUnit:"100",pageIndex:String(pageIndex),
      }).toString();
      const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error("공식 제공자 응답 실패");
      const body=await response.json() as {jsonArray?:unknown[];item?:unknown[]};
      const rows=body.jsonArray??body.item;
      if(!Array.isArray(rows)) throw new Error("공식 JSON 응답 형식 확인 필요");
      pagesFetched++;lastPageLength=rows.length;
      for(const raw of rows.slice(0,100)){
        const b=parseBizinfoRecord(raw,feedState.lastAttempt,testMode);
        if(excludedCategory(b)){excluded++;continue;}
        const fingerprint=createHash("sha256").update(canonical(raw)).digest("hex");
        const prior=(await pool.query("SELECT content_hash FROM iroun_feed_snapshots WHERE source_id=$1",[b.sourceId])).rows[0];
        if(prior?.content_hash===fingerprint){
          await refreshOfficialCheck(b.sourceId,b.checkedAt);
          unchanged++;continue;
        }
        const result=await stageOfficialNotice(b,"official-bizinfo-worker",{
          sourceRecord:raw,baselineOnly:!prior,contentHash:fingerprint,
        });
        if(result.reused) updated++;
        else created++;
        staged++;
        feedState.staged=staged;
      }
      if(rows.length<100) break;
    }
    const limited=pagesFetched===config.maxPages&&lastPageLength>=100;
    feedState.nextPage=lastPageLength>=100?pageStart+pagesFetched:1;
    Object.assign(feedState,{
      status:"검토대기",lastSuccess:new Date().toISOString(),staged,unchanged,pagesFetched,limited,excluded,created,updated,
      reason:limited
        ?"승인된 페이지 한도까지 확인했습니다. 추가 자료가 있을 수 있으며 전국 수집 완료가 아닙니다. 새 자료는 검토대기이고 자동 공개하지 않습니다."
        :"공식 API의 제한된 페이지를 확인했습니다. 전국 수집 완료가 아니며 새 자료는 검토대기이고 자동 공개하지 않습니다.",
    });
    await storeFeedState(stateKey,feedState);
    return {blocked:false,staged,unchanged,excluded,pagesFetched,limited,nationwideComplete:false,automaticallyPublished:false};
  }catch{
    feedState.status="확인 필요";feedState.reason="공식 API 호출 또는 응답 처리 실패. 자동수집 완료가 아닙니다.";
    await storeFeedState(stateKey,feedState);
    throw Object.assign(new Error(feedState.reason),{status:503});
  }finally{
    if(acquired) await lock.query("SELECT pg_advisory_unlock(83417)");
    lock.release();
  }
}

export async function bizinfoStatus(){
  const saved=await storedFeedState("bizinfo");
  const config=bizinfoFeedConfiguration();
  return {
    name:"기업마당",
    ...saved,
    status:config.ready?saved.status??"아직 수집하지 않음":"미연동",
    keyConfigured:!!process.env.BIZINFO_API_KEY,
    operatorApproved:process.env.BIZINFO_API_APPROVED==="true",
    termsAccepted:process.env.BIZINFO_TERMS_APPROVED==="true",
    approvedScopeConfigured:(process.env.IROUN_BIZINFO_APPROVED_SCOPE?.trim().length??0)>=3,
    intervalMinutes:Number.isFinite(config.intervalMinutes)?config.intervalMinutes:null,
    maxPages:Number.isFinite(config.maxPages)?config.maxPages:null,
    coverage:"한 번에 최대 100건씩 승인된 페이지 한도까지 확인. 원문·첨부 자격은 운영자 추가 검토 필요. 전국 수집 완료 아님.",
    reason:config.ready?saved.reason??"공식 수집·검토 필요":config.reason,
  };
}
