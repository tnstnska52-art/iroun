/**
 * 서류 이름 맞추기(서버·앱 공용).
 * 공고마다 같은 서류를 다르게 부른다("사업자등록증" / "사업자 등록증명원"). 같은 종류면 같은 서류로 보고
 * 내 서류함에 한 번 담아 둔 파일을 다른 공고에서도 그대로 가져온다.
 * 종류를 모르는 서류는 띄어쓰기·기호만 무시하고 이름이 같을 때만 같은 서류로 본다.
 */
export const DOC_KINDS: { key: string; label: string; re: RegExp }[] = [
  { key: "bizreg", label: "사업자등록증명", re: /사업자\s*등록\s*증/ },
  { key: "smallbiz", label: "소상공인확인서", re: /소상공인\s*확인서/ },
  { key: "sme", label: "중소기업확인서", re: /중소기업\s*확인서/ },
  { key: "vat", label: "부가가치세 과세표준증명", re: /부가가치세\s*과세\s*표준/ },
  { key: "sales", label: "표준재무제표증명(매출 증빙)", re: /표준\s*재무제표|매출\s*증빙|매출액\s*증명/ },
  { key: "localtax", label: "지방세 납세증명서", re: /지방세\s*(?:완납|납세)/ },
  { key: "nationaltax", label: "국세 납세증명서", re: /국세\s*(?:완납|납세)|^납세\s*증명/ },
  { key: "insurance4", label: "4대보험 가입자명부", re: /4대\s*(?:사회)?\s*보험/ },
  { key: "employ", label: "고용보험 가입자명부", re: /고용보험/ },
  { key: "corpreg", label: "법인등기부등본", re: /법인\s*등기/ },
  { key: "resident-full", label: "주민등록등본", re: /주민등록\s*(?:표)?\s*등본/ },
  { key: "resident-part", label: "주민등록초본", re: /주민등록\s*(?:표)?\s*초본/ },
  { key: "family", label: "가족관계증명서", re: /가족관계\s*증명/ },
  { key: "lease", label: "임대차계약서", re: /임대차\s*계약서/ },
  { key: "labor", label: "근로계약서", re: /근로\s*계약서/ },
  { key: "bank", label: "통장 사본", re: /통장\s*사본/ },
  { key: "id", label: "신분증", re: /신분증/ },
];
/** 띄어쓰기와 기호 차이는 무시한 이름 */
export const docKey = (s: string) => s.normalize("NFKC").replace(/[\s·,()\-_/]/g, "").toLowerCase();
/** 같은 서류인지 가리는 열쇠: 아는 종류면 종류, 모르면 이름 */
export function docMatchKey(name: string) {
  const n = name.normalize("NFKC");
  const k = DOC_KINDS.find((d) => d.re.test(n));
  return k ? `kind:${k.key}` : `name:${docKey(n)}`;
}
