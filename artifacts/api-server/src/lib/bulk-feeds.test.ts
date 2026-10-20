import { describe, expect, it } from "vitest";
import { findDuplicates, isBusinessService, mapKstartup, normTitle } from "./bulk-feeds";
import { benefitSchema, type Benefit } from "./benefit-domain";

const base = (over: Partial<Benefit>): Benefit => benefitSchema.parse({
  id: "bizinfo-PBLN_1", sourceId: "PBLN_1", title: "제목", kind: "지원금", audience: "사업", category: "경영", region: "전국",
  agency: "중소벤처기업부", sourceUrl: "https://www.bizinfo.go.kr/x", summary: "", support: "", calculation: "", checks: [], documents: [],
  startsAt: "", endsAt: "", checkedAt: "2026-10-01T00:00:00Z", budgetStatus: "확인 필요", status: "접수 중", reviewStatus: "공개", isTest: false, rules: [],
  ...over,
});

describe("K-Startup 매핑", () => {
  it("공고 필드를 공고로 바꾼다", () => {
    const b = mapKstartup({
      pbanc_sn: "174512", biz_pbanc_nm: "2026년 예비창업패키지 추가모집", pbanc_ntrp_nm: "창업진흥원",
      detl_pg_url: "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=174512",
      pbanc_rcpt_bgng_dt: "20261001", pbanc_rcpt_end_dt: "20261031", supt_regin: "전국", supt_biz_clsfc: "사업화",
      aply_trgt: "예비창업자", biz_enyy: "예비창업자", pbanc_ctnt: "사업화 자금 최대 1억원 지원",
    }, "2026-10-20T00:00:00Z");
    expect(b.id).toBe("kstartup-174512");
    expect(b.startsAt).toBe("2026-10-01");
    expect(b.endsAt).toBe("2026-10-31");
    expect(b.region).toBe("전국");
    expect(b.reviewStatus).toBe("검토대기");
    expect(b.checks.some((c) => c.startsWith("신청대상"))).toBe(true);
  });
  it("공식 주소가 아니면 K-Startup 상세 주소로 바꾸고, 식별자가 없으면 거절한다", () => {
    expect(mapKstartup({ pbanc_sn: "9", biz_pbanc_nm: "공고", detl_pg_url: "http://evil.example" }).sourceUrl).toContain("k-startup.go.kr");
    expect(() => mapKstartup({ biz_pbanc_nm: "공고" })).toThrow();
  });
});

describe("정부24 사업자 서비스 선별", () => {
  it("소상공인·법인 대상만 고른다", () => {
    expect(isBusinessService({ 사용자구분: "소상공인" })).toBe(true);
    expect(isBusinessService({ 사용자구분: "법인/시설/단체" })).toBe(true);
    expect(isBusinessService({ 사용자구분: "개인||가구" })).toBe(false);
  });
});

describe("중복 정리", () => {
  it("제목의 연도·차수·[지역]·공고 같은 말을 뗀다", () => {
    expect(normTitle("[경기] 2026년 2차 소상공인 경영개선 지원사업 공고")).toBe(normTitle("소상공인 경영개선 지원사업"));
  });
  it("다른 출처의 같은 사업은 기업마당을 남기고 나머지를 중복으로 본다", () => {
    const a = base({ id: "bizinfo-PBLN_1", title: "2026년 고용창출장려금 및 고용안정장려금 사업 공고", agency: "고용노동부" });
    const b = base({ id: "gov24-1", sourceId: "gov24:1", title: "고용창출장려금 및 고용안정장려금", agency: "고용노동부", sourceUrl: "https://www.gov.kr/a" });
    const c = base({ id: "kstartup-5", sourceId: "kstartup:5", title: "2026년 예비창업패키지 공고", agency: "창업진흥원", endsAt: "2026-10-31", sourceUrl: "https://www.k-startup.go.kr/a" });
    const d = base({ id: "bizinfo-PBLN_2", sourceId: "PBLN_2", title: "[전국] 2026년 예비창업패키지 모집 공고", agency: "중소벤처기업부", endsAt: "2026-10-31" });
    const dup = findDuplicates([a, b, c, d]);
    expect(dup.get("gov24-1")).toBe("bizinfo-PBLN_1");
    expect(dup.get("kstartup-5")).toBe("bizinfo-PBLN_2");
    expect(dup.has("bizinfo-PBLN_1")).toBe(false);
  });
  it("같은 출처 안에서는 기관·마감일까지 같아야 중복이고, 짧은 일반 제목은 묶지 않는다", () => {
    const a = base({ id: "bizinfo-PBLN_1", title: "[서울] 소상공인 지원", agency: "서울시", endsAt: "2026-11-01" });
    const b = base({ id: "bizinfo-PBLN_2", sourceId: "PBLN_2", title: "[부산] 소상공인 지원", agency: "부산시", endsAt: "2026-11-01" });
    const c = base({ id: "gov24-9", sourceId: "gov24:9", title: "창업지원", agency: "서울시", sourceUrl: "https://www.gov.kr/b" });
    const d = base({ id: "bizinfo-PBLN_3", sourceId: "PBLN_3", title: "청년 창업지원 프로그램 참여기업 모집", agency: "서울시" });
    expect(findDuplicates([a, b, c, d]).size).toBe(0);
  });
  it("이미 중복으로 숨긴 공고도 계속 중복으로 본다", () => {
    const a = base({ id: "bizinfo-PBLN_1", title: "2026년 고용창출장려금 및 고용안정장려금 사업 공고", agency: "고용노동부" });
    const b = base({ id: "gov24-1", sourceId: "gov24:1", title: "고용창출장려금 및 고용안정장려금", agency: "고용노동부", sourceUrl: "https://www.gov.kr/a", reviewStatus: "비공개", duplicateOf: "bizinfo-PBLN_1" });
    expect(findDuplicates([a, b]).get("gov24-1")).toBe("bizinfo-PBLN_1");
  });
  it("같은 출처의 다른 연도·차수 공고는 묶지 않는다", () => {
    const a = base({ id: "bizinfo-PBLN_1", title: "2022년 12월 최초지정 혁신제품 지정기간 연장 공고", agency: "산업통상부" });
    const b = base({ id: "bizinfo-PBLN_2", sourceId: "PBLN_2", title: "2023년 12월 최초지정 혁신제품 지정기간 연장 공고", agency: "산업통상부" });
    expect(findDuplicates([a, b]).size).toBe(0);
  });
});
