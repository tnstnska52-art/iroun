import {createHash} from "node:crypto";
import {type Benefit,type Profile,matchBenefit,noticeTime} from "./benefit-domain";
export const CONSENT_VERSION="2026-10-service-2";
export const consentTexts={
 service:"맞춤 조건 비교·신청 지원 요청 처리를 위해 선택 입력한 개인·가구·사업장 정보를 처리합니다. 계약 이용권, 회사 접수·배정·문의 기록을 관리합니다. 탈퇴 후에도 재체험 방지를 위해 확인된 이메일의 해시와 체험 시각이 별도로 남습니다. 이는 완전한 익명정보라고 단정하지 않으며 보유기간과 법적 근거를 출시 전 확정해야 하는 개발용 초안입니다. 회사 연락처도 출시 전 확정이 필요합니다.",
 marketing:"새 상품·행사 등 마케팅 안내 수신은 선택입니다. 거절하거나 철회해도 무료체험·계약 서비스에 불이익이 없습니다.",
};
export function finished(b:Benefit,now=Date.now()){
 return b.status==="마감"||b.budgetStatus==="소진"||(!!b.endsAt&&Number.isFinite(noticeTime(b.endsAt,"end"))&&noticeTime(b.endsAt,"end")<now);
}
export function historicalMatch(b:Benefit,p:Profile){
 const ref=Number.isFinite(noticeTime(b.startsAt,"start"))?new Date(noticeTime(b.startsAt,"start")):
  Number.isFinite(noticeTime(b.endsAt,"end"))?new Date(noticeTime(b.endsAt,"end")):new Date(b.checkedAt);
 return matchBenefit({...b,status:"접수 중",budgetStatus:"해당 없음",startsAt:"",endsAt:""},p,ref).map(m=>({
  ...m,referenceExclusions:m.exclusions,exclusions:[],result:"추가 확인 필요",
  unknowns:[...m.unknowns,"당시 소재지·업종·소득·매출·고용·가구 조건은 확인되지 않았습니다."],
  basis:"현재 입력정보 기준 참고 · 당시 조건 확인 필요",referenceYear:new Date(ref.getTime()+9*3600000).getUTCFullYear(),
 }));
}
export function noticeVersion(b:Benefit){return createHash("sha256").update(JSON.stringify([b.sourceId,b.title,b.rules,b.startsAt,b.endsAt,b.status,b.budgetStatus])).digest("hex");}
export function validPhone(v:string){return !v||/^(0\d{8,10}|1[568]\d{6})$/.test(v.replace(/[\s-]/g,""));}
export function validKakao(v:string){
 if(!v)return true;
 try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&
  ((u.hostname==="open.kakao.com"&&/^\/o\/[A-Za-z0-9]+\/?$/.test(u.pathname))||
   (u.hostname==="pf.kakao.com"&&/^\/_[A-Za-z0-9]+(?:\/chat)?\/?$/.test(u.pathname)));}catch{return false;}
}
