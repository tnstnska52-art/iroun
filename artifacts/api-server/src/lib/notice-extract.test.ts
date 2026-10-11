import { describe, expect, it } from "vitest";
import { applyExtraction, autoPublishable, extractNotice } from "./notice-extract";
import { benefitSchema, matchBenefit, type Benefit, type Profile } from "./benefit-domain";

// 시험용 문장: 실제 공고가 아니라 공고에서 흔히 쓰는 표현을 본떠 쓴 것이다.
const NOW = new Date("2026-10-11T12:00:00+09:00");
const SAMPLE = `○ 지원대상: 경기도 수원시에 사업장을 둔 상시근로자 5인 미만 소상공인
○ 업력 7년 이내, 연매출액 3억원 이하인 음식점업 영위 사업자
○ 지원내용: 점포 환경개선 비용을 업체당 최대 300만원 이내 지원 (총 사업비 10억원)
○ 신청기간: 2026. 9. 21. ~ 2026. 10. 23. (예산 소진 시 조기 마감)
○ 제출서류: 신청서, 사업자등록증명원, 소상공인확인서, 임대차계약서`;
const base: Benefit = benefitSchema.parse({ id: "t1", title: "2026년 소상공인 경영환경 개선 지원", kind: "지원금", audience: "사업", category: "경영", region: "관할 확인 필요", agency: "시험기관", sourceUrl: "https://www.bizinfo.go.kr/x", sourceId: "PBLN_1", summary: "", support: "", calculation: "", checks: ["관할 지역·업종·지원대상·중복수혜·접수 여부를 원문에서 검토해야 합니다."], documents: [], startsAt: "", endsAt: "", checkedAt: NOW.toISOString(), budgetStatus: "확인 필요", status: "확인 필요", reviewStatus: "검토대기", isTest: false, rules: [] });
const profile = (biz: Record<string, unknown>): Profile => ({ personal: {}, step: 0, businesses: [{ id: "b", ...biz }] } as Profile);

describe("공고 자동 정리", () => {
  const x = extractNotice({ title: base.title, text: SAMPLE }, NOW);
  it("지역·기간·금액·서류를 원문에서 읽는다", () => {
    expect(x.region).toBe("경기 수원시");
    expect([x.startsAt, x.endsAt, x.status]).toEqual(["2026-09-21", "2026-10-23", "접수 중"]);
    expect(x.maxAmount).toBe(3_000_000);
    expect(x.documents).toEqual(expect.arrayContaining(["신청서", "사업자등록증명", "소상공인확인서", "임대차계약서"]));
    expect(x.budgetStatus).toBe("확인 필요");
  });
  it("자격 조건을 규칙으로 만든다", () => {
    const by = Object.fromEntries(x.rules.map((r) => [r.field, r]));
    expect(by.employees).toMatchObject({ operator: "lte", value: 4 });
    expect(by.openedAt).toMatchObject({ operator: "after", value: "2019-10-11" });
    expect(by.revenue).toMatchObject({ operator: "lte", value: 300_000_000 });
    expect(by.industry).toMatchObject({ operator: "in", value: ["음식점"] });
  });
  it("뽑은 항목마다 근거 문장을 남긴다", () => {
    expect(x.evidence.find((e) => e.field === "maxAmount")?.quote).toContain("최대 300만원");
    expect(x.evidence.every((e) => SAMPLE.includes(e.quote.replace(/…$/, "")) || e.quote === base.title)).toBe(true);
  });
  it("총 사업비·매출 금액을 지원금으로 읽지 않는다", () => {
    expect(extractNotice({ title: "지원", text: "총 사업비 10억원 규모. 연매출액 5억원 이하 기업 대상." }, NOW).maxAmount).toBeUndefined();
  });
  it("뒤쪽 연도가 빠진 기간과 억·천만 단위를 읽는다", () => {
    const y = extractNotice({ title: "[부산] 수출 지원", text: "접수기간: 2026.11.2.(월) ~ 11.20.(금)\n기업당 1억 5천만원 한도 지원" }, NOW);
    expect([y.region, y.startsAt, y.endsAt, y.status, y.maxAmount]).toEqual(["부산", "2026-11-02", "2026-11-20", "확인 필요", 150_000_000]);
  });
  it("일반 낱말 '경기 침체'를 지역으로 읽지 않고, 없는 항목은 비워 둔다", () => {
    const y = extractNotice({ title: "경기 침체 극복 소상공인 지원", text: "자세한 내용은 공고문 참조" }, NOW);
    expect(y.region).toBeUndefined();
    expect(y.missing).toEqual(expect.arrayContaining(["지원 지역", "신청기간", "세부 자격", "지원 금액", "필요 서류"]));
    expect(y.confidence).toBe(0);
  });
  it("제외 업종 문장은 규칙으로 만들지 않고 주의로 남긴다", () => {
    const y = extractNotice({ title: "지원", text: "지원 제외 업종: 숙박업, 건설업" }, NOW);
    expect(y.rules.find((r) => r.field === "industry")).toBeUndefined();
    expect(y.cautions.join()).toContain("제외 업종");
  });
  it("정리 결과로 고객 조건과 비교한다", () => {
    const b = benefitSchema.parse(applyExtraction(base, x));
    expect(b.region).toBe("경기 수원시");
    expect(b.checks.some((c) => c.includes("원문에서 검토해야"))).toBe(false);
    const ok = matchBenefit(b, profile({ province: "경기도", district: "수원시", industry: "음식점", openedYear: 2022, revenue: "1억~3억 원", employeeBand: "1~4명" }), NOW)[0]!;
    expect(ok.exclusions).toEqual([]);
    expect(ok.reasons.length).toBeGreaterThanOrEqual(5);
    expect(matchBenefit(b, profile({ province: "경기도", district: "수원시", industry: "음식점", openedYear: 2022, revenue: "3억~10억 원", employeeBand: "1~4명" }), NOW)[0]!.unknowns.join()).toContain("연매출");
    expect(matchBenefit(b, profile({ province: "경기도", district: "수원시", industry: "제조", openedYear: 2012, revenue: "10억 원 이상", employeeBand: "10~29명" }), NOW)[0]!.exclusions.length).toBe(4);
    expect(matchBenefit(b, profile({ province: "서울특별시", district: "강남구" }), NOW)[0]!.result).toBe("대상 제외");
  });
  it("운영자가 채운 값은 덮어쓰지 않는다", () => {
    const b = applyExtraction({ ...base, region: "전국", maxAmount: 1, documents: ["직접 쓴 서류"] }, x);
    expect([b.region, b.maxAmount, b.documents]).toEqual(["전국", 1, ["직접 쓴 서류"]]);
  });
  it("자동 공개는 설정을 켜고 애매한 점이 없을 때만", () => {
    expect(autoPublishable(x, { IROUN_AUTO_PUBLISH_CONFIDENT: "true" })).toBe(false); // 시·군·구, 업력 기준일 주의
    const clear = extractNotice({ title: "[경기] 소상공인 지원", text: "상시근로자 5인 미만 대상. 업체당 최대 200만원 지원. 신청기간: 2026.10.1. ~ 2026.10.30. 제출서류: 신청서" }, NOW);
    expect(clear.cautions).toEqual([]);
    expect(autoPublishable(clear, { IROUN_AUTO_PUBLISH_CONFIDENT: "true" })).toBe(true);
    expect(autoPublishable(clear, {})).toBe(false);
  });
});
