import { describe, it, expect } from "vitest";
import { entitlement, matchBenefit, excludedCategory, officialUrl, publicBenefit, profileSchema, type Benefit } from "./benefit-domain";

export const fixture:Benefit={
  id:"test-only",title:"테스트 전용",kind:"지원금",audience:"사업",category:"시설",region:"경상남도",
  agency:"테스트 기관",sourceId:"test-only",sourceUrl:"https://www.gimhae.go.kr/",summary:"테스트",support:"테스트",calculation:"없음",
  checks:[],documents:["서류"],startsAt:"2026-01-01",endsAt:"2026-12-31",checkedAt:"2026-01-01",
  budgetStatus:"해당 없음",status:"접수 중",reviewStatus:"공개",isTest:true,
  rules:[{scope:"business",field:"district",operator:"eq",value:"김해시",label:"사업장 김해시"}],
};
const now=new Date("2026-10-10T00:00:00Z");
describe("통합 입력 구분",()=>{
 it("근로자와 사업자를 함께 저장",()=>expect(profileSchema.parse({personal:{employment:["근로자","사업자"]},businesses:[],step:0}).personal.employment).toEqual(["근로자","사업자"]));
 it("모름 표시는 미응답·실제 0과 독립 보존",()=>{
  const p=profileSchema.parse({personal:{children:0},businesses:[],step:2,unknownAnswers:["personal.income"]});
  expect(p.personal.children).toBe(0);expect(p.personal.income).toBeUndefined();expect(p.unknownAnswers).toEqual(["personal.income"]);
 });
});
describe("서버 이용권 OR 및 만료",()=>{
  const future="2026-11-01T00:00:00Z",past="2026-01-01T00:00:00Z";
  it("무료는 권한 없음",()=>expect(entitlement(undefined,undefined,now.getTime()).active).toBe(false));
  it("유효 구독 허용",()=>expect(entitlement({expiresAt:future,state:"active"},undefined,now.getTime()).active).toBe(true));
  it("유효 무상권 허용",()=>expect(entitlement(undefined,{expiresAt:future},now.getTime()).active).toBe(true));
  it("구독 만료 후 무상권 유지",()=>expect(entitlement({expiresAt:past,state:"expired"},{expiresAt:future},now.getTime()).active).toBe(true));
  it("무상권 회수 후 구독 유지",()=>expect(entitlement({expiresAt:future,state:"active"},{expiresAt:future,revoked:true},now.getTime()).active).toBe(true));
  it("둘 다 만료 차단",()=>expect(entitlement({expiresAt:past,state:"active"},{expiresAt:past},now.getTime()).active).toBe(false));
  it("환불 구독 차단",()=>expect(entitlement({expiresAt:future,state:"refunded"},undefined,now.getTime()).active).toBe(false));
  it("자동갱신 취소는 이미 결제된 기간까지 유지",()=>expect(entitlement({expiresAt:future,state:"cancelled"},undefined,now.getTime()).active).toBe(true));
  it("정확한 만료시각 경계 차단",()=>expect(entitlement(undefined,{expiresAt:now.toISOString()},now.getTime()).active).toBe(false));
});
describe("조건 판정",()=>{
  const profile={personal:{province:"부산광역시",district:"해운대구",birthYear:1960},businesses:[{id:"a",province:"경상남도",district:"김해시",industry:"음식점"},{id:"b",province:"부산광역시",district:"수영구",industry:"소매업"}],step:0};
  it("부산 거주·김해 사업장 독립판정",()=>expect(matchBenefit(fixture,profile,now).map(r=>r.result)).toEqual(["조건 일치","대상 제외"]));
  it("사업자 공고에서도 사업장과 개인·가구 자격을 함께 유지",()=>{
    const benefit={...fixture,rules:[
      {scope:"business" as const,field:"industry" as const,operator:"eq" as const,value:"음식점",label:"사업 업종"},
      {scope:"personal" as const,field:"household" as const,operator:"eq" as const,value:"한부모",label:"가구 자격"},
    ]};
    const householdProfile={...profile,personal:{...profile.personal,household:"한부모"},businesses:[{...profile.businesses[0],industry:"음식점"}]};
    expect(matchBenefit(benefit,householdProfile,now)[0].result).toBe("조건 일치");
  });
  it("개인 공고는 개인 거주지만 비교",()=>expect(matchBenefit({...fixture,region:"부산",audience:"개인",rules:[{scope:"personal",field:"province",operator:"eq",value:"부산광역시",label:"부산 거주"}]},profile,now)[0].result).toBe("조건 일치"));
  it("모르는 업종은 탈락시키지 않음",()=>expect(matchBenefit({...fixture,rules:[{scope:"business",field:"industry",operator:"eq",value:"제조업",label:"업종"}]},{...profile,businesses:[{id:"a"}]},now)[0].result).toBe("추가 확인 필요"));
  it("업종 불일치 제외",()=>expect(matchBenefit({...fixture,rules:[{scope:"business",field:"industry",operator:"eq",value:"제조업",label:"업종"}]},profile,now)[0].result).toBe("대상 제외"));
  it("출생연도만으로 나이 경계 확정하지 않음",()=>expect(matchBenefit({...fixture,rules:[{scope:"personal",field:"age",operator:"gte",value:66,label:"만나이"}]},profile,now)[0].result).toBe("추가 확인 필요"));
  it("신청기간 지난 경우 제외",()=>expect(matchBenefit({...fixture,endsAt:"2026-01-01"},profile,now)[0].result).toBe("대상 제외"));
  it("예산 소진 제외",()=>expect(matchBenefit({...fixture,budgetStatus:"소진"},profile,now)[0].result).toBe("대상 제외"));
  it("중복수혜 정보 미확인",()=>expect(matchBenefit({...fixture,rules:[{scope:"personal",field:"duplicateBenefit",operator:"eq",value:"없음",label:"중복수혜"}]},profile,now)[0].result).toBe("추가 확인 필요"));
  it("소득구간을 확정 수치로 쓰지 않음",()=>expect(matchBenefit({...fixture,rules:[{scope:"personal",field:"income",operator:"lte",value:3000,label:"소득"}]},{...profile,personal:{income:"3천만원 미만"}},now)[0].result).toBe("추가 확인 필요"));
  it("업체 정보가 없어도 미확인으로 유지",()=>expect(matchBenefit(fixture,{personal:{},businesses:[],step:0},now)[0].result).toBe("추가 확인 필요"));
  it("시도 짧은 이름과 정식 명칭 같은 관할",()=>expect(matchBenefit({...fixture,region:"경남",rules:[{scope:"business",field:"province",operator:"eq",value:"경남",label:"경남 사업장"}]},profile,now)[0].result).toBe("조건 일치"));
  it("개인 거주지가 사업장 대신 사용되지 않음",()=>expect(matchBenefit({...fixture,region:"경남",audience:"개인",rules:[]},profile,now)[0].result).toBe("대상 제외"));
  it("존재하지 않는 개업 날짜 입력 차단",()=>expect(profileSchema.safeParse({personal:{},businesses:[{id:"one",openedAt:"2026-02-31"}],step:0}).success).toBe(false));
});
describe("공개자료와 금지 범위",()=>{
  for(const title of ["특례보증","보증료 지원","대출 이자 지원","신규 대출상품","이차보전","융자지원"]) it(`${title} 제외`,()=>expect(excludedCategory({...fixture,title})).toBe(true));
  it("테스트는 공개 불가",()=>expect(publicBenefit(fixture)).toBe(false));
  it("비공식 출처 공개 불가",()=>expect(publicBenefit({...fixture,isTest:false,sourceUrl:"https://example.com"})).toBe(false));
  it("검토대기 공개 불가",()=>expect(publicBenefit({...fixture,isTest:false,reviewStatus:"검토대기"})).toBe(false));
  it("확인시각 없으면 공개 불가",()=>expect(publicBenefit({...fixture,isTest:false,checkedAt:""})).toBe(false));
  it("가짜 공식 도메인 차단",()=>expect(officialUrl("https://gov.kr.evil.example/x")).toBe(false));
  it("출처 URL 자격증명 차단",()=>expect(officialUrl("https://fixture@example.invalid/")).toBe(false));
  it("프로필로 권한 변경 불가",()=>expect(profileSchema.safeParse({personal:{},businesses:[],step:0,role:"admin"}).success).toBe(false));
  it("민감정보 수집 차단",()=>expect(profileSchema.safeParse({personal:{residentNumber:"123"},businesses:[],step:0}).success).toBe(false));
});
