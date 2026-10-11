import {randomUUID} from "node:crypto";
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from "vitest";
import {pool} from "@workspace/db";
import {runPublicFeed,publicFeedStatus} from "./public-feeds";
import {mapPublicBenefit} from "./public-feed-model";
import {stageOfficialNotice} from "./official-ingestion";
const suffix=randomUUID(),id=`qa-api-${suffix}`,url=`https://www.gov.kr/portal/service?qa=${suffix}`;
const list={"서비스ID":id,"서비스명":"시험용 생활지원","소관기관명":"시험용 기관","상세조회URL":url};
function provider(title="시험용 생활지원",conditionEmpty=false){
 return vi.fn(async(input:URL|string|Request)=>{
  const u=new URL(String(input));
  const data=u.pathname.endsWith("serviceList")?{...list,"서비스명":title}:u.pathname.endsWith("serviceDetail")?{"서비스ID":id,"서비스명":title,"소관기관명":"시험용 기관","지원내용":"시험 자료","지원대상":"개인","선정기준":"기관 확인 필요"}:{"서비스ID":id,JA0110:19};
  return new Response(JSON.stringify({totalCount:1,data:conditionEmpty&&u.pathname.endsWith("supportConditions")?[]:[data]}),{status:200});
 }) as unknown as typeof fetch;
}
beforeEach(async()=>{
 for(const k of ["GOV24_API_KEY","WELFARE_CENTRAL_API_KEY","WELFARE_LOCAL_API_KEY","DATA_GO_KR_SERVICE_KEY"])vi.stubEnv(k,"");
 vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","true");
 vi.stubEnv("IROUN_GOV24_APPROVED","true");
 await publicFeedStatus();
 await pool.query("DELETE FROM iroun_public_feed_state WHERE source='gov24:test'");
 await pool.query("DELETE FROM iroun_public_feed_quota WHERE source='gov24:test'");
 await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[`gov24-${id}`]);
 await pool.query("DELETE FROM iroun_feed_snapshots WHERE source_id=$1",[`gov24:${id}`]);
 for(const source of ["welfareCentral","welfareLocal"]){
  await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[`${source}-${id}`]);
  await pool.query("DELETE FROM iroun_feed_snapshots WHERE source_id=$1",[`${source}:${id}`]);
  await pool.query("DELETE FROM iroun_public_feed_state WHERE source=$1",[`${source}:test`]);
  await pool.query("DELETE FROM iroun_public_feed_quota WHERE source=$1",[`${source}:test`]);
 }
});
afterEach(()=>vi.unstubAllEnvs());
afterAll(async()=>{
 await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[`gov24-${id}`]);
 await pool.query("DELETE FROM iroun_feed_snapshots WHERE source_id=$1",[`gov24:${id}`]);
 await pool.query("DELETE FROM iroun_audit WHERE subject=$1",[`gov24-${id}`]);
 await pool.query("DELETE FROM iroun_public_feed_state WHERE source='gov24:test'");
 await pool.query("DELETE FROM iroun_public_feed_quota WHERE source='gov24:test'");
 for(const source of ["welfareCentral","welfareLocal"]){
  await pool.query("DELETE FROM iroun_benefits WHERE id=$1",[`${source}-${id}`]);
  await pool.query("DELETE FROM iroun_feed_snapshots WHERE source_id=$1",[`${source}:${id}`]);
  await pool.query("DELETE FROM iroun_audit WHERE subject=$1",[`${source}-${id}`]);
  await pool.query("DELETE FROM iroun_public_feed_state WHERE source=$1",[`${source}:test`]);
  await pool.query("DELETE FROM iroun_public_feed_quota WHERE source=$1",[`${source}:test`]);
 }
 await pool.end();
});
describe("신규 공식 API 실행부·개발 DB 모의응답",()=>{
 it("주기수집은 키·승인 표시만으로 시작하지 않고 일일 제한도 필요",async()=>{
  const {publicFeedScheduleReady}=await import("./public-feeds");
  vi.stubEnv("GOV24_API_KEY","test-placeholder");vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","true");vi.stubEnv("IROUN_GOV24_APPROVED","true");
  for(const invalid of ["","0","-1","1.5","bad"]){
   vi.stubEnv("IROUN_GOV24_DAILY_LIMIT",invalid);expect(publicFeedScheduleReady("gov24")).toBe(false);
  }
  vi.stubEnv("IROUN_GOV24_DAILY_LIMIT","1");expect(publicFeedScheduleReady("gov24")).toBe(true);
  vi.stubEnv("IROUN_GOV24_APPROVED","false");expect(publicFeedScheduleReady("gov24")).toBe(false);
 });
 it("기관 기본 한도를 계정 승인 한도로 표시하지 않음",async()=>{
  const {publicFeedStatus}=await import("./public-feeds");
  const entry=(await publicFeedStatus()).find(x=>x.source==="gov24")!;
  expect(entry.publishedDefaultDailyMaximum).toBe(10000);
  expect(entry.approvedDailyMaximum).toBeNull();
  expect(entry.quotaNotice).toContain("개발 서버가 멈추면");
 });
 it("동일 원문 URL의 다른 공급자 자료는 기존 공고로 통합",async()=>{
  const b=mapPublicBenefit("gov24",list,{"소관기관명":"시험 기관","지원내용":"시험"}, {},undefined,true);
  await stageOfficialNotice(b,"qa-source");
  const second={...b,id:`welfareCentral-${id}`,sourceId:`welfareCentral:${id}`};
  const r=await stageOfficialNotice(second,"qa-source");
  expect(r.reused).toBe(true);expect(r.id).toBe(b.id);
  expect((await pool.query("SELECT id FROM iroun_benefits WHERE data->>'sourceUrl'=$1",[url])).rowCount).toBe(1);
 });
 it("시험자료를 같은 식별자로 운영자료로 승격하지 못함",async()=>{
  const b=mapPublicBenefit("gov24",list,{"소관기관명":"시험 기관","지원내용":"시험"}, {},undefined,true);
  await stageOfficialNotice(b,"qa-source");
  await expect(stageOfficialNotice({...b,isTest:false},"qa-source")).rejects.toThrow("분리 등록");
  expect((await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[b.id])).rows[0].data.isTest).toBe(true);
 });
 it("세 공급자 모두 키 없으면 HTTP 호출 없음",async()=>{
  const f=vi.fn();
  for(const s of ["gov24","welfareCentral","welfareLocal"] as const)expect((await runPublicFeed(s,f,true)).blocked).toBe(true);
  expect(f).not.toHaveBeenCalled();
 });
 it("키가 있어도 운영자 승인 없으면 차단",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");vi.stubEnv("IROUN_OFFICIAL_FEEDS_ENABLED","false");const f=vi.fn();expect((await runPublicFeed("gov24",f,true)).blocked).toBe(true);expect(f).not.toHaveBeenCalled();});
 it("목록·상세·조건 3회 읽고 검토대기 시험자료 저장",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");const f=provider();const r=await runPublicFeed("gov24",f,true);expect(r.staged).toBe(1);const b=(await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[`gov24-${id}`])).rows[0].data;expect(b.reviewStatus).toBe("검토대기");expect(b.isTest).toBe(true);expect(b.rules).toHaveLength(1);expect(f).toHaveBeenCalledTimes(3);});
 it("같은 응답 재수집은 중복 등록·알림 생성 안함",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");await runPublicFeed("gov24",provider(),true);expect((await runPublicFeed("gov24",provider(),true)).unchanged).toBe(1);expect((await pool.query("SELECT id FROM iroun_benefits WHERE id=$1",[`gov24-${id}`])).rowCount).toBe(1);});
 it("빈 목록은 503이며 성공시각 없음",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");await expect(runPublicFeed("gov24",async()=>new Response('{"data":[]}',{status:200}),true)).rejects.toMatchObject({status:503});const d=(await pool.query("SELECT data FROM iroun_public_feed_state WHERE source='gov24:test'")).rows[0].data;expect(d.lastSuccess).toBeUndefined();});
 it("성공 후 실패는 이전 성공시각 유지",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");const r=await runPublicFeed("gov24",provider(),true);await expect(runPublicFeed("gov24",async()=>new Response("",{status:503}),true)).rejects.toThrow();expect((await pool.query("SELECT data FROM iroun_public_feed_state WHERE source='gov24:test'")).rows[0].data.lastSuccess).toBe(r.lastSuccess);});
 it("승인 한도 예약 후 추가 HTTP 차단",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");vi.stubEnv("IROUN_GOV24_DAILY_LIMIT","1");const f=provider();await expect(runPublicFeed("gov24",f,true)).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);});
 it("제외 카테고리 저장 안함",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");expect((await runPublicFeed("gov24",provider("보증료 지원"),true)).excluded).toBe(1);expect((await pool.query("SELECT id FROM iroun_benefits WHERE id=$1",[`gov24-${id}`])).rowCount).toBe(0);});
 it("지원조건 표 없음은 상세 원문 검토대기",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");expect((await runPublicFeed("gov24",provider(undefined,true),true)).staged).toBe(1);expect((await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[`gov24-${id}`])).rows[0].data.rules).toHaveLength(0);});
 it("상세 식별자 불일치는 저장 차단",async()=>{vi.stubEnv("GOV24_API_KEY","test-placeholder");await expect(runPublicFeed("gov24",async(input,opts)=>String(input).includes("serviceDetail")?new Response(JSON.stringify({data:[{"서비스ID":"other"}]})):provider()(input,opts),true)).rejects.toThrow();});
 for(const source of ["welfareCentral","welfareLocal"] as const)it(`${source} 공식 목록·상세 XML 경로와 DB 검토대기 모의시험`,async()=>{
  vi.stubEnv(source==="welfareCentral"?"WELFARE_CENTRAL_API_KEY":"WELFARE_LOCAL_API_KEY","test-placeholder");
  vi.stubEnv(`IROUN_${source.toUpperCase()}_APPROVED`,"true");
  const f=vi.fn(async(input:URL|string|Request)=>{
   const u=new URL(String(input)),detail=u.pathname.includes("detailed");
   if(source==="welfareCentral")expect(u.searchParams.get("callTp")).toBe(detail?"D":"L");
   if(detail)expect(u.searchParams.get("servId")).toBe(id);
   const data=`<servId>${id}</servId><servNm>시험 복지자료</servNm><jurMnofNm>시험 기관</jurMnofNm><ctpvNm>부산</ctpvNm><sggNm>동구</sggNm><bizChrDeptNm>복지과</bizChrDeptNm><servDtlLink>https://www.bokjiro.go.kr/?qa=${suffix}</servDtlLink><alwServCn>지원내용 시험</alwServCn>`;
   return new Response(detail?`<wantedDtl><resultCode>0</resultCode>${data}</wantedDtl>`:`<wantedList><resultCode>0</resultCode><totalCount>1</totalCount><servList>${data}</servList></wantedList>`);
  });
  expect((await runPublicFeed(source,f,true)).staged).toBe(1);expect(f).toHaveBeenCalledTimes(2);
  const b=(await pool.query("SELECT data FROM iroun_benefits WHERE id=$1",[`${source}-${id}`])).rows[0].data;expect(b.isTest).toBe(true);expect(b.reviewStatus).toBe("검토대기");
 });
});
