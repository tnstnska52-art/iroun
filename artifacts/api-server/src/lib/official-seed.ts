import { pool } from "@workspace/db";
import { benefitSchema, normalizeSourceKey, publicBenefit, type Benefit } from "./benefit-domain";
import { audit } from "./benefit-store";

// Manual source review, not an automated collection job. All source pages were
// fetched successfully from the named official hosts before this file was authored.
const checkedAt = new Date().toISOString();
const base = {
  region:"전국", startsAt:"", endsAt:"", checkedAt,
  budgetStatus:"확인 필요" as const, status:"확인 필요" as const,
  reviewStatus:"공개" as const, isTest:false,
};
const items: Benefit[] = [
  {...base,id:"nts-earned-income",kind:"지원금",audience:"가구",category:"생활",
    title:"근로장려금 제도 안내",agency:"국세청",sourceId:"cntnts-7781",
    sourceUrl:"https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7781&mi=2450",
    summary:"근로자뿐 아니라 사업자(전문직 제외) 가구도 소득·재산 등 조건에 따라 신청할 수 있습니다.",
    support:"가구 구성과 소득에 따라 지급액이 달라집니다. 사업자라는 이유만으로 대상에서 제외되지 않습니다. 실제 신청 가능 여부는 국세청에서 확인해 주세요.",
    calculation:"국세청은 가구 유형별 총소득 기준과 지급액 산식을 적용합니다. 소득구간만으로 개인 금액을 계산하거나 최대금액을 합산하지 않습니다.",
    checks:["부부합산 총소득과 가구 유형별 기준","가구원 재산과 제외 요건","전문직 사업소득 등 제외 조건","해당 귀속연도 신청기간"],
    documents:["국세청에서 요청한 소득·재산 확인자료"],rules:[]},
  {...base,id:"nts-child-support",kind:"지원금",audience:"가구",category:"육아",
    title:"자녀장려금 제도 안내",agency:"국세청",sourceId:"cntnts-7782",
    sourceUrl:"https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7782&mi=2451",
    summary:"18세 미만 부양자녀가 있는 가구의 자녀양육을 돕는 제도입니다. 사업소득이 있는 가구도 자격 확인이 필요합니다.",
    support:"공식 안내는 부부합산 총소득 7,000만원 미만 및 부양자녀 등 요건을 설명합니다. 개인의 지급액과 선정은 보장하지 않습니다.",
    calculation:"자녀 수와 총소득·재산 등 기관 기준에 따라 산정합니다. 입력한 자녀 수만으로 지급액을 확정하지 않습니다.",
    checks:["부양자녀의 나이 및 자격","부부합산 총소득 7,000만원 미만 여부","가구 재산 및 나머지 수급 요건","해당 귀속연도 신청기간"],
    documents:["국세청에서 요청한 가구·소득 확인자료"],
    rules:[{scope:"personal",field:"children",operator:"gte",value:1,label:"부양자녀 수"}]},
  {...base,id:"nts-refund-route",kind:"환급금",audience:"개인",category:"세금",
    title:"국세환급금 공식 조회 안내",agency:"국세청",sourceId:"nts-public-refund-link",
    sourceUrl:"https://www.nts.go.kr/",
    summary:"국세청 공식 홈페이지의 ‘국세환급금 찾기’ 경로에서 본인이 직접 조회할 수 있습니다.",
    support:"납부한 세금의 환급 여부는 홈택스 등 공식기관 조회 결과로 확인합니다. 현재 이 앱은 국세청 계정이나 환급액 조회와 연결되어 있지 않습니다.",
    calculation:"개인 환급액을 계산·표시하지 않습니다. 확인된 기관 조회 결과만 실제 환급액으로 볼 수 있습니다.",
    checks:["국세청 홈페이지에서 국세환급금 찾기 선택","본인 조회 결과와 환급 가능 기간 확인"],
    documents:["공식 조회기관이 요청하는 본인확인 수단"],rules:[],
    status:"상시 조회",budgetStatus:"해당 없음"},
  {...base,id:"bizinfo-sodam-2026",kind:"지원금",audience:"사업",category:"마케팅",
    title:"2026 소담스퀘어 전주 소상공인 지원 프로그램",agency:"중소벤처기업부·전주정보문화산업진흥원",sourceId:"PBLN_000000000121478",
    sourceUrl:"https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000121478",
    summary:"디지털전환이 필요한 소상공인의 온라인시장 진출을 돕는 교육·콘텐츠 제작·입점 지원 프로그램입니다.",
    support:"공식 공고는 AI 마케팅·숏폼·라이브커머스 교육, 상세페이지·홍보영상 제작, 플랫폼 입점 등을 안내합니다. 현금 지급을 의미하지 않습니다.",
    calculation:"프로그램별 제공 범위와 선발 기준을 공식 신청처에서 확인해야 합니다. 개인 지원액은 제시하지 않습니다.",
    checks:["소상공인 자격 및 정상 영업 여부","프로그램별 지원 지역·업종·모집 여부","중복 지원 제한","예산 잔여 및 실제 접수 가능 여부"],
    documents:["2026년 소담스퀘어 전주 지원사업 신청서"],
    startsAt:"2026-04-29T00:00:00+09:00",endsAt:"2026-12-31T23:59:59+09:00",rules:[]},
];

/** 공식 자료 기본 4건을 넣는다. 이미 있는 것(운영자가 고친 것 포함)은 덮어쓰지 않는다. 새로 넣은 개수를 돌려준다. */
export async function seedOfficial() {
  let added = 0;
  for(const item of items){
    const b=benefitSchema.parse(item);
    if(!publicBenefit(b)) throw new Error("공개할 수 없는 자료입니다.");
    const result=await pool.query("INSERT INTO iroun_benefits(id,source_key,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",[b.id,normalizeSourceKey(b),JSON.stringify(b)]);
    if(result.rowCount){added++;await audit("manual-source-review","공식 자료 수동 확인·초기 공개",b.id,{sourceUrl:b.sourceUrl,checkedAt:b.checkedAt,scope:"제도 설명 또는 공고 본문; 잔여예산·실제 접수는 미확인"});}
  }
  return added;
}
