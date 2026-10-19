import { describe, expect, it } from "vitest";
import { applyAi, aiReviewStatus, type AiResult } from "./ai-structure";
import { matchBenefit, type Benefit } from "./benefit-domain";

const base: Benefit = {
  id: "bizinfo-PBLN_000000000000001", title: "[경기] 시흥시 소상공인 경영개선 지원", kind: "지원금", audience: "사업", category: "경영", region: "관할 확인 필요",
  agency: "경기도", sourceUrl: "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000000001", sourceId: "PBLN_000000000000001",
  summary: "요약", support: "요약", calculation: "", checks: ["관할 지역·업종·지원대상·중복수혜·접수 여부를 원문에서 검토해야 합니다."], documents: [],
  startsAt: "", endsAt: "", checkedAt: "2026-10-19T00:00:00.000Z", budgetStatus: "확인 필요", status: "확인 필요", reviewStatus: "검토대기", isTest: false, rules: [],
};
const ai: AiResult = {
  is_business_support: true, is_loan_or_guarantee: false, region: "경기 시흥시", industries: ["음식점", "도소매"],
  max_employees: 4, min_employees: null, max_years_in_business: 7, min_years_in_business: null, max_revenue_won: 300000000, min_revenue_won: null,
  entity: "무관", target: ["소상공인"], max_amount_won: 3000000, starts_at: "2026-10-01", ends_at: "2026-11-30", documents: ["사업자등록증명"], summary: "점포 개선비 최대 300만원", unclear: [], fit_industries: ["음식점"], small_business_fit: 5,
};
const now = new Date("2026-10-19T03:00:00Z");
const profile = (biz: Record<string, unknown>) => ({ personal: {}, businesses: [{ id: "w", ...biz }], step: 0 }) as never;

describe("AI 공고 정리 반영", () => {
  const b = applyAi(base, ai, "claude-haiku-5-5", now);
  it("지역·조건·금액·기간을 채운다", () => {
    expect(b.region).toBe("경기 시흥시");
    expect(b.rules.map((r) => r.field)).toEqual(["industry", "employees", "openedAt", "revenue"]);
    expect(b.maxAmount).toBe(3000000);
    expect(b.status).toBe("접수 중");
    expect(b.checks).toEqual([]);
    expect(b.extraction?.ai?.version).toBe(2);
    expect(b.fit).toEqual({ industries: ["음식점"], small: 5 });
  });
  it("조건이 맞는 사업장은 조건 일치, 다른 지역·업종은 제외", () => {
    const ok = matchBenefit(b, profile({ industry: "음식점", province: "경기도", district: "시흥시", openedYear: 2024, revenue: "1억~3억 원", employeeBand: "1~4명" }), now)[0]!;
    expect(ok.result).toBe("조건 일치");
    expect(matchBenefit(b, profile({ industry: "제조", province: "경기도", district: "시흥시", openedYear: 2024, revenue: "1억~3억 원", employeeBand: "1~4명" }), now)[0]!.result).toBe("대상 제외");
    expect(matchBenefit(b, profile({ industry: "음식점", province: "경기도", district: "수원시", openedYear: 2024, revenue: "1억~3억 원", employeeBand: "1~4명" }), now)[0]!.result).toBe("대상 제외");
  });
  it("사업자 지원이 아니거나 대출이면 비공개", () => {
    expect(aiReviewStatus(base, b, { ...ai, is_business_support: false })).toBe("비공개");
    expect(aiReviewStatus(base, b, { ...ai, is_loan_or_guarantee: true })).toBe("비공개");
    expect(aiReviewStatus(base, b, ai)).toBe("공개");
  });
});
