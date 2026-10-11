// Explicit, development-only source review. Preserves originals and records proposals.
import {pool} from "@workspace/db";
import {stageOfficialNotice} from "./lib/official-ingestion";
import {type Benefit} from "./lib/benefit-domain";
import {text} from "./lib/public-feed-model";
async function main(){
 if(process.env.NODE_ENV==="production"||!process.argv.includes("--record-reviewed-proposals"))throw Error("개발 검토 기록 실행 조건 필요");
 const ids=["gov24-000000465790","welfareCentral-WLF00000022","welfareLocal-WLF00006788"];
 const found=(await pool.query("SELECT data FROM iroun_benefits WHERE id=ANY($1::text[])",[ids])).rows.map(x=>x.data as Benefit);
 if(found.length!==3||found.some(b=>b.isTest||b.reviewStatus!=="검토대기"))throw Error("예상 검토대기 자료와 다름: 변경하지 않음");
 for(const original of found.filter(b=>!process.argv.includes("--only-central")||b.id===ids[1])){
  const proposed:Benefit={...original,checkedAt:new Date().toISOString(),status:"확인 필요",budgetStatus:"확인 필요",checks:original.checks.map(text),support:text(original.support)};
  let finding="";
  if(original.id===ids[0]){
   proposed.audience="가구";
   proposed.rules=original.rules.filter(r=>!(r.scope==="personal"&&r.field==="age"));
   finding="정부24 원문 대조: 2026.3.1~2027.2.28 기준연도, 상시신청. 3~5세는 자녀 조건으로 가입자 나이와 비교 금지. 출생일 예외·취학유예·중복수혜·국적 예외·거주기간은 확인 필요.";
  }else if(original.id===ids[1]){
   proposed.documents=[];
   proposed.checks=proposed.checks.filter(c=>!c.startsWith("신청방법:"));
   proposed.checks.push("신청방법: 서비스가 필요한 산재노동자가 서면이나 온라인으로 접수. 근로복지공단 초기상담·접수, 조사·심사, 대상자 결정, 서비스 지원, 사후관리. 구체적인 접수처·구비서류는 기관 확인 필요.");
   finding="복지로 공식 페이지에서 2026 기준 지원대상·선정기준·서비스 내용·신청방법 탭 대조. API의 신청기관연락처목록 등은 신청 절차가 아님. 일상복귀지원규정은 고객 필수 제출서류로 확정할 수 없음. 신청기간·예산·구비서류 확인 필요.";
  }else{
   proposed.documents=["통합지원 신청서 (공식 원문 서식). 추가 구비서류는 담당기관 확인 필요."];
   finding="복지로 지자체 원문(최종수정 2026-10-09) 대조: 대구 북구, 가사지원 주2회/월24시간/3개월, 병원동행 월2회/월6시간/3개월. 소득별 자부담 조건 확인. 원문 통합지원 신청서 확인. 신청기간·예산·개인별 선정은 확인 필요.";
  }
  proposed.checks.push(finding);
  const result=await stageOfficialNotice(proposed,"system:official-source-review",{
   sourceRecord:{sourceUrl:original.sourceUrl,reviewedAt:proposed.checkedAt,method:"공식 공개 페이지 대조",finding,exclusionReview:"확인한 내용상 보증·보증료·대출이자·신규대출 추천 사업 아님",publicationApproved:false},
  });
  console.log(JSON.stringify({id:result.id,preserved:result.preserved,reviewStatus:result.reviewStatus,automaticallyPublished:result.automaticallyPublished}));
 }
}
main().catch(()=>{console.error("검토 기록 실패: 내부 자료 상태 확인 필요");process.exitCode=1;}).finally(()=>pool.end());
