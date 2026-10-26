import { bizinfoFeedConfiguration,runBizinfoFeed } from "./official-feed";
import { deliverDeadlines,checkPushReceipts } from "./push-delivery";
import { logger } from "./logger";
import {catalog} from "./public-feed-model";
import {runPublicFeed,publicFeedScheduleReady,storedFeedState} from "./public-feeds";
import {crmSyncReady,startCrmSync} from "./crm-contracts";
import {pool} from "@workspace/db";
import {checkLeadReady,flushCheckLeads} from "./check-leads";
import {aiReady,runAiStructuring} from "./ai-structure";
import {runBizinfoArchive} from "./bizinfo-archive";
import {gov24BulkReady,hideDuplicates,kstartupReady,runGov24Bulk,runKstartup} from "./bulk-feeds";
/** 기업마당 → 정부24 전체(하루 1번) → K-Startup → AI 정리 → 중복 정리. 출처 하나가 실패해도 나머지는 계속한다. */
export async function collectAll(){
  await runBizinfoFeed().catch(()=>logger.warn("기업마당 수집 실패: 관리자 확인 필요"));
  if(gov24BulkReady())await runGov24Bulk().catch(e=>logger.warn({err:(e as Error).message},"정부24 전체 수집 실패"));
  if(kstartupReady())await runKstartup().catch(e=>logger.warn({err:(e as Error).message},"K-Startup 수집 실패"));
  // 작년 마감 공고('놓친 지원금')는 아직 다 모으지 못했으면 한 번 모은다.
  if(kstartupReady()){
    const last=new Date().getFullYear()-1;
    const done=(await storedFeedState(`kstartup:archive:${last}`) as {lastSuccess?:string}).lastSuccess;
    if(!done)await runKstartup(fetch,{archiveYear:last}).catch(e=>logger.warn({err:(e as Error).message},"K-Startup 작년 공고 수집 실패"));
  }
  // 기업마당 작년 마감 공고도 다 읽을 때까지 수집할 때마다 이어서 읽는다.
  if(bizinfoFeedConfiguration().ready)await runBizinfoArchive().catch(e=>logger.warn({err:(e as Error).message},"기업마당 작년 공고 수집 실패"));
  if(aiReady())await runAiStructuring().catch(()=>logger.warn("AI 공고 정리 실패"));
  await hideDuplicates().catch(()=>logger.warn("중복 공고 정리 실패"));
}
/** 개인정보처리방침의 보유 기간이 지난 기록을 지운다(하루 한 번). */
export async function purgeExpired(client:Pick<typeof pool,"query">=pool){
  const jobs:[string,string][]=[
    ["iroun_fund_leads","updated_at < now() - interval '1 year'"],
    ["iroun_trial_ledger","started_at < now() - interval '1 year'"],
    ["iroun_audit","created_at < now() - interval '5 years'"],
  ];
  let removed=0;
  for(const [t,w] of jobs){
    if(!(await client.query("SELECT to_regclass($1) r",[t])).rows[0].r)continue;
    removed+=(await client.query(`DELETE FROM ${t} WHERE ${w}`)).rowCount??0;
  }
  return removed;
}
/** Opt-in only. No key/flag means no provider call and no success log. */
export function startServiceScheduler(){
  const timers:ReturnType<typeof setInterval>[]=[];
  if(process.env.IROUN_OFFICIAL_FEEDS_ENABLED==="true"){
    const configuredMinutes=Number(process.env.IROUN_FEED_INTERVAL_MINUTES);
    const intervalMinutes=Math.max(60,Number.isInteger(configuredMinutes)&&configuredMinutes>=15&&configuredMinutes<=10080?configuredMinutes:60);
    for(const source of Object.keys(catalog) as (keyof typeof catalog)[]){
      // 정부24 전체 수집을 쓰면 시간당 2건짜리 소량 수집은 돌리지 않는다(같은 자료를 두 번 보지 않게).
      if(source==="gov24"&&gov24BulkReady())continue;
      if(publicFeedScheduleReady(source)){
        timers.push(setInterval(()=>{void runPublicFeed(source).catch(()=>logger.warn("공공서비스 수집 확인 필요"));},intervalMinutes*60000));
      }
    }
  }
  const feedConfig=bizinfoFeedConfiguration();
  if(feedConfig.ready){
    // 수집이 끝나면 새 공고를 AI 로 정리한다(키가 있을 때만).
    const run=()=>{void collectAll().catch(()=>logger.warn("공고 수집·정리 실패"));};
    run();
    timers.push(setInterval(run,feedConfig.intervalMinutes*60000));
  }
  if(process.env.IROUN_PUSH_SEND_ENABLED==="true"){
    timers.push(setInterval(()=>{void deliverDeadlines().then(()=>deliverDeadlines(undefined,undefined,Date.now(),"personalized")).then(()=>checkPushReceipts()).catch(()=>logger.warn("푸시 작업 실패: 제공자 확인 필요"));},60000));
  }
  if(process.env.DATABASE_URL){
    const purge=()=>{void purgeExpired().catch(()=>logger.warn("보유기간 지난 기록 정리 실패"));};
    setTimeout(purge,60000).unref();
    timers.push(setInterval(purge,24*3600000));
  }
  // 회사 전산 패키지 계약 수신: 공동 키(CRM_APP_INBOUND_SECRET)가 있을 때만 60초마다.
  const stopCrm=crmSyncReady()?startCrmSync():()=>{};
  // 홈페이지 조회 고객: 전산이 못 받은 것을 1분마다 다시 보낸다.
  if(checkLeadReady()){void flushCheckLeads().catch(()=>undefined);timers.push(setInterval(()=>{void flushCheckLeads().catch(()=>undefined);},60000));}
  for(const t of timers)t.unref();
  return ()=>{timers.forEach(clearInterval);stopCrm();};
}
