import { bizinfoFeedConfiguration,runBizinfoFeed } from "./official-feed";
import { deliverDeadlines,checkPushReceipts } from "./push-delivery";
import { logger } from "./logger";
import {catalog} from "./public-feed-model";
import {runPublicFeed,publicFeedScheduleReady} from "./public-feeds";
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
    const run=()=>{void runBizinfoFeed().catch(()=>logger.warn("공식 수집 실패: 관리자 확인 필요"));};
    run();
    timers.push(setInterval(run,feedConfig.intervalMinutes*60000));
  }
  if(process.env.IROUN_PUSH_SEND_ENABLED==="true"){
    timers.push(setInterval(()=>{void deliverDeadlines().then(()=>deliverDeadlines(undefined,undefined,Date.now(),"personalized")).then(()=>checkPushReceipts()).catch(()=>logger.warn("푸시 작업 실패: 제공자 확인 필요"));},60000));
  }
  for(const t of timers)t.unref();
  return ()=>timers.forEach(clearInterval);
}
