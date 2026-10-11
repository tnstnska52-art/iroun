import {describe,it,expect} from "vitest";
import {mapPublicBenefit,parseWelfareXml} from "./public-feed-model";
import {excludedCategory,publicBenefit} from "./benefit-domain";
const list={"서비스ID":"test-government","서비스명":"국민 생활 지원","소관기관명":"시험 공식 기관","상세조회URL":"https://www.gov.kr/portal/service","서비스목적요약":"공식 시험 형식"};
const detail={"서비스ID":"test-government","소관기관명":"시험 공식 기관","지원대상":"개인·가구","선정기준":"기관 확인 필요","지원내용":"생활 지원","신청기한":"확인 필요"};
describe("신규 공식 공공서비스 파서",()=>{
 it("유아학비의 아동 나이로 성인 보호자를 제외하지 않음",()=>{
  const b=mapPublicBenefit("gov24",{...list,"서비스명":"유아학비 (누리과정) 지원"},{...detail,"지원대상":"3~5세 유아의 보호자"},{JA0110:3,JA0111:5},undefined,true);
  expect(b.audience).toBe("가구");expect(b.rules).toEqual([]);
  expect(b.checks.join(" ")).toContain("가입자 본인 나이와 비교하지 않습니다");
 });
 it("복지로 숫자 줄바꿈 엔티티를 설명에 노출하지 않음",()=>{
  const b=mapPublicBenefit("gov24",list,{...detail,"지원내용":"첫 설명&#13;다음 설명&#10;끝"});
  expect(b.support).toBe("첫 설명 다음 설명 끝");
 });
 it("정부24 목록·상세 출처와 조건은 검토대기 시험자료로 분리",()=>{
  const b=mapPublicBenefit("gov24",list,detail,{JA0110:19,JA0111:65},undefined,true);
  expect(b.isTest).toBe(true);expect(b.rules).toHaveLength(2);expect(b.rules[0]?.operator).toBe("gte");expect(publicBenefit(b)).toBe(false);
 });
 it("문자열 나이와 미확인 조건을 추측하지 않음",()=>expect(mapPublicBenefit("gov24",list,detail,{JA0110:"성인"}).rules).toEqual([]));
 it("키나 가짜 금액을 데이터에 만들지 않음",()=>{const b=mapPublicBenefit("gov24",list,detail);expect(b.endsAt).toBe("");expect(b.budgetStatus).toBe("확인 필요");expect(b.calculation).toContain("실제 지급액·환급액이 아닙니다");});
 it("비공식 원문 거부",()=>expect(()=>mapPublicBenefit("gov24",{...list,"상세조회URL":"https://example.com"},detail)).toThrow());
 it("정부 사칭 호스트 거부",()=>expect(()=>mapPublicBenefit("gov24",{...list,"상세조회URL":"https://www.gov.kr.example.com"},detail)).toThrow());
 it("복지로 중앙 XML 정상 목록",()=>expect(parseWelfareXml("<wantedList><resultCode>0</resultCode><servList><servId>T</servId></servList></wantedList>").servList).toEqual({servId:"T"}));
 it("복지로 지자체 상세 XML",()=>expect(parseWelfareXml("<response><resultCode>00</resultCode><servId>T</servId></response>",true).servId).toBe("T"));
 it("XML 오류 코드를 성공으로 처리하지 않음",()=>expect(()=>parseWelfareXml("<response><resultCode>30</resultCode></response>")).toThrow());
 it("빈 XML 목록 차단",()=>expect(()=>parseWelfareXml("<wantedList><resultCode>0</resultCode></wantedList>")).toThrow());
 it("DTD와 외부 엔티티 차단",()=>expect(()=>parseWelfareXml('<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>')).toThrow());
 it("복지 시행 종료일을 신청 마감으로 오인하지 않음",()=>{
  const b=mapPublicBenefit("welfareLocal",{servId:"L",servNm:"생활 지원",ctpvNm:"부산광역시",sggNm:"동구",bizChrDeptNm:"복지과",servDtlLink:"https://www.bokjiro.go.kr/"},{servId:"L",enfcEndYmd:"20261231",sprtTrgtCn:"가구",alwServCn:"생활 지원"});
  expect(b.endsAt).toBe("");expect(b.region).toContain("부산");
 });
 it("대출·보증료 자체 지원 제외",()=>expect(excludedCategory({title:"소상공인 보증료 지원",category:"금융"})).toBe(true));
 it("대출을 제외한 장비 지원을 잘못 제외하지 않음",()=>expect(excludedCategory({title:"장비 지원(대출·보증료 제외)",category:"시설"})).toBe(false));
});
