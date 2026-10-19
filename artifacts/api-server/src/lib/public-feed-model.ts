import {XMLParser} from "fast-xml-parser";
import {benefitSchema,officialUrl,type Benefit} from "./benefit-domain";
export const catalog={
  gov24:{name:"정부24 공공서비스",doc:"https://www.data.go.kr/data/15113968/openapi.do",key:"GOV24_API_KEY",limit:10000,base:"https://api.odcloud.kr/api/gov24/v3/"},
  welfareCentral:{name:"복지로 중앙부처",doc:"https://www.data.go.kr/data/15090532/openapi.do",key:"WELFARE_CENTRAL_API_KEY",limit:100,base:"https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/"},
  welfareLocal:{name:"복지로 지자체",doc:"https://www.data.go.kr/data/15108347/openapi.do",key:"WELFARE_LOCAL_API_KEY",limit:1000,base:"https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/"},
} as const;
export type PublicFeed=keyof typeof catalog;
export type Row=Record<string,unknown>;
export const text=(v:unknown)=>typeof v==="string"||typeof v==="number"?String(v).replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;|&#13;|&#10;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim():"";
export const rows=(v:unknown):Row[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==="object"):v&&typeof v==="object"?[v as Row]:[];
export function parseWelfareXml(xml:string,detail=false):Row{
  if(xml.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error("허용하지 않는 공식 XML 형식");
  const parsed=new XMLParser({parseTagValue:false,processEntities:false,ignoreAttributes:true}).parse(xml);
  const r=parsed.wantedList??parsed.wantedDtl??parsed.response??parsed;
  const body=r.body??r;
  if(!["0","00"].includes(text(body.resultCode??r.header?.resultCode)))throw new Error("공식 제공자 오류 또는 결과 코드 누락");
  if(!detail&&!rows(body.servList).length)throw new Error("공식 목록이 비었습니다. 최신 데이터 성공으로 처리하지 않습니다.");
  return body;
}
export function mapPublicBenefit(source:PublicFeed,list:Row,detail:Row,conditions:Row={},checkedAt=new Date().toISOString(),isTest=false):Benefit{
  const gov=source==="gov24",local=source==="welfareLocal";
  const id=text(gov?list["서비스ID"]:list.servId),title=text(gov?list["서비스명"]:list.servNm);
  const agency=text(gov?detail["소관기관명"]??list["소관기관명"]:local?`${text(list.ctpvNm)} ${text(list.sggNm)} ${text(detail.bizChrDeptNm??list.bizChrDeptNm)}`:detail.jurMnofNm??list.jurMnofNm);
  const raw=text(gov?list["상세조회URL"]:list.servDtlLink);
  if(!id||!title||!agency||!officialUrl(raw))throw new Error("공식 식별자·기관·출처 누락 또는 허용되지 않는 원문");
  const target=text(gov?detail["지원대상"]:local?detail.sprtTrgtCn:detail.tgtrDtlCn);
  const criteria=text(gov?detail["선정기준"]:detail.slctCritCn);
  const support=text(gov?detail["지원내용"]:local?detail.alwServCn:detail.alwServCn);
  const period=text(gov?detail["신청기한"]:"");
  // Welfare implementation dates are NOT application dates.
  const dates=[...period.matchAll(/(\d{4})[.-](\d{2})[.-](\d{2})/g)].map(m=>`${m[1]}-${m[2]}-${m[3]}`);
  const rules:Benefit["rules"]=[];
  const childTarget=gov&&/유아|아동|자녀|어린이|영유아/.test(`${title} ${target}`);
  if(gov&&!childTarget)for(const [field,op] of [["JA0110","gte"],["JA0111","lte"]] as const){
    const v=conditions[field];
    if(typeof v==="number"&&v>=0&&v<=150)rules.push({scope:"personal",field:"age",operator:op,value:v,label:`공식 대상 나이 ${op==="gte"?"최소":"최대"} ${v}세`});
  }
  const docs=gov?text(detail["구비서류"]):rows(detail.basfrmList).map(x=>text(x.servSeDetailNm??x.servSeDetailLink)).filter(Boolean).join("; ");
  const method=gov?text(detail["신청방법"]):local?text(detail.aplyMtdCn):"공식 원문의 신청방법과 담당기관 확인 필요";
  return benefitSchema.parse({id:`${source}-${id}`,sourceId:`${source}:${id}`,title,
    kind:"지원금",audience:gov&&/법인|소상공인/.test(text(list["사용자구분"]))?"사업":childTarget?"가구":"개인",category:text(gov?list["서비스분야"]:list.intrsThemaNmArray??list.intrsThemaArray)||"공공 혜택",
    region:local?`${text(list.ctpvNm)} ${text(list.sggNm)}`:"관할 확인 필요",
    agency,sourceUrl:raw,summary:(text(gov?list["서비스목적요약"]:list.servDgst)||support||"공식 원문 확인 필요").slice(0,1000),
    support:(support||"지원내용 원문 확인 필요").slice(0,5000),
    calculation:"기관의 선정·예산·중복수혜 확인이 필요합니다. 실제 지급액·환급액이 아닙니다.",
    checks:[...(childTarget?["아동·자녀 대상 나이는 가입자 본인 나이와 비교하지 않습니다. 자녀의 당시 나이·출생일·보호자 자격 확인 필요."]:[]),...(!gov&&docs?[`기관 제공 서식·참고자료: ${docs}. 실제 제출 필요 여부 확인 필요.`]:[]),`지원대상: ${target||"확인 필요"}`,`선정기준: ${criteria||"확인 필요"}`,`신청기간: ${period||"확인 필요"}`,`신청방법: ${method||"확인 필요"}`].map(s=>s.slice(0,500)),
    documents:gov&&docs?[docs.slice(0,200)]:[],startsAt:dates[0]??"",endsAt:dates[1]??"",checkedAt,budgetStatus:"확인 필요",status:"확인 필요",reviewStatus:"검토대기",isTest,rules});
}
