import { bizinfoFeedConfiguration,runBizinfoFeed } from "./official-feed";
import { deliverDeadlines,checkPushReceipts } from "./push-delivery";
import { logger } from "./logger";
import {catalog} from "./public-feed-model";
import {runPublicFeed,publicFeedScheduleReady} from "./public-feeds";
import {crmSyncReady,startCrmSync} from "./crm-contracts";
import {aiReady,runAiStructuring} from "./ai-structure";
/** Opt-in only. No key/flag means no provider call and no success log. */
export function startServiceScheduler(){
  const timers:ReturnType<typeof setInterval>[]=[];
  if(process.env.IROUN_OFFICIAL_FEEDS_ENABLED==="true"){
    const configuredMinutes=Number(process.env.IROUN_FEED_INTERVAL_MINUTES);
    const intervalMinutes=Math.max(60,Number.isInteger(configuredMinutes)&&configuredMinutes>=15&&configuredMinutes<=10080?configuredMinutes:60);
    for(const source of Object.keys(catalog) as (keyof typeof catalog)[]){
      if(publicFeedScheduleReady(source)){
        timers.push(setInterval(()=>{void runPublicFeed(source).catch(()=>logger.warn("공공서비스 수집 확인 필요"));},intervalMinutes*60000));
      }
    }
  }
  const feedConfig=bizinfoFeedConfiguration();
  if(feedConfig.ready){
    // 수집이 끝나면 새 공고를 AI 로 정리한다(키가 있을 때만).
    const run=()=>{void runBizinfoFeed().catch(()=>logger.warn("공식 수집 실패: 관리자 확인 필요")).then(()=>aiReady()?runAiStructuring():undefined).catch(()=>logger.warn("AI 공고 정리 실패"));};
    run();
    timers.push(setInterval(run,feedConfig.intervalMinutes*60000));
  }
  if(process.env.IROUN_PUSH_SEND_ENABLED==="true"){
    timers.push(setInterval(()=>{void deliverDeadlines().then(()=>deliverDeadlines(undefined,undefined,Date.now(),"personalized")).then(()=>checkPushReceipts()).catch(()=>logger.warn("푸시 작업 실패: 제공자 확인 필요"));},60000));
  }
  // 회사 전산 패키지 계약 수신: 공동 키(CRM_APP_INBOUND_SECRET)가 있을 때만 60초마다.
  const stopCrm=crmSyncReady()?startCrmSync():()=>{};
  for(const t of timers)t.unref();
  return ()=>{timers.forEach(clearInterval);stopCrm();};
}
