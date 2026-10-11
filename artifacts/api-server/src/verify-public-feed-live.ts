// One-shot operator verification. Never starts the scheduler or publishes.
import {pool} from "@workspace/db";
import {runPublicFeed,storedFeedState} from "./lib/public-feeds";
import {catalog,type PublicFeed} from "./lib/public-feed-model";

if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")
  throw new Error("개발 환경 전용 검사");
if(!process.argv.includes("--approved-one-shot"))
  throw new Error("활용승인 확인 후 일회성 실행 옵션 필요");

const sources=Object.keys(catalog) as PublicFeed[];
// Process-local only: does not enable the running server's scheduler.
process.env.IROUN_OFFICIAL_FEEDS_ENABLED="true";
try {
  for(const source of sources){
    if(!process.env[catalog[source].key]){
      console.log(JSON.stringify({source,keyPresent:false}));
      continue;
    }
    process.env[`IROUN_${source.toUpperCase()}_APPROVED`]="true";
    const originalCursor=(await storedFeedState(source)).nextPage??1;
    const cache=new Map<string,{body:string,status:number}>();
    let networkCalls=0;
    const boundedFetch:typeof fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.searchParams.has("perPage"))url.searchParams.set("perPage","1");
      if(url.searchParams.has("numOfRows"))url.searchParams.set("numOfRows","1");
      if(url.searchParams.has("page"))url.searchParams.set("page","1");
      if(url.searchParams.has("pageNo"))url.searchParams.set("pageNo","1");
      const cacheKey=url.href;
      let saved=cache.get(cacheKey);
      if(!saved){
        if(networkCalls>=3)throw new Error("일회성 호출 상한");
        networkCalls++;
        const response=await fetch(url,{...init,redirect:"error"});
        saved={body:await response.text(),status:response.status};
        cache.set(cacheKey,saved);
        console.log(JSON.stringify({source,phase:"http",http:response.status}));
      }
      return new Response(saved.body,{status:saved.status});
    };
    try{
      const first=await runPublicFeed(source,boundedFetch);
      console.log(JSON.stringify({source,phase:"first",...first,networkCalls}));
      // Replay the same approved response without another provider request.
      // Keep the paging cursor unchanged for this repeatability check.
      const second=await runPublicFeed(source,boundedFetch);
      console.log(JSON.stringify({source,phase:"duplicate",...second,networkCalls}));
    }catch{
      console.log(JSON.stringify({source,phase:"failed",networkCalls,detail:"원문·키 비공개. 저장 상태와 공급자 형식 추가 확인 필요"}));
      process.exitCode=1;
    }finally{
      // The verification pins page 1. Do not advance the real collection cursor.
      await pool.query(
        "UPDATE iroun_public_feed_state SET data=jsonb_set(data,'{nextPage}',$2::jsonb) WHERE source=$1",
        [source,JSON.stringify(originalCursor)],
      );
    }
  }
}finally{await pool.end();}
