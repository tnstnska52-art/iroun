import { describe, expect, it } from "vitest";
import { standingPrograms } from "./standing-programs";
import { matchBenefit, publicBenefit, type Profile } from "./benefit-domain";

const all = standingPrograms();
const get = (id: string) => all.find((b) => b.id === id)!;
const prof = (biz: Record<string, unknown>): Profile => ({ personal: {}, businesses: [{ id: "b", province: "서울특별시", industry: "음식점", ...biz }], step: 2 } as Profile);
const result = (id: string, biz: Record<string, unknown>) => matchBenefit(get(id), prof(biz), new Date("2026-11-02T12:00:00+09:00"))[0]!.result;

describe("상시 지원 제도(고용장려금·두루누리·소상공인 경감)", () => {
  it("모두 공개할 수 있는 공식 출처 자료", () => {
    expect(all.length).toBeGreaterThanOrEqual(10);
    for (const b of all) expect(publicBenefit(b)).toBe(true);
  });
  it("두루누리: 직원 1~9명이면 조건 일치, 직원 없음·10명 이상이면 대상 제외", () => {
    expect(result("standing-durunuri", { employeeBand: "1~4명" })).toBe("조건 일치");
    expect(result("standing-durunuri", { employeeBand: "5~9명" })).toBe("조건 일치");
    expect(result("standing-durunuri", { employeeBand: "없음" })).toBe("대상 제외");
    expect(result("standing-durunuri", { employeeBand: "10~29명" })).toBe("대상 제외");
    expect(result("standing-durunuri", {})).toBe("추가 확인 필요");
  });
  it("청년일자리도약: 직원 5명 이상", () => {
    expect(result("standing-youth-leap", { employeeBand: "5~9명" })).toBe("조건 일치");
    expect(result("standing-youth-leap", { employeeBand: "1~4명" })).toBe("대상 제외");
  });
  it("소상공인 고용보험료: 직원 5명 미만(없어도 됨)", () => {
    expect(result("standing-self-employed-insurance", { employeeBand: "없음" })).toBe("조건 일치");
    expect(result("standing-self-employed-insurance", { employeeBand: "5~9명" })).toBe("대상 제외");
  });
  it("경영안정 바우처: 매출 1억 미만·2025년까지 개업이면 맞고, 매출이 크면 제외", () => {
    expect(result("standing-stability-voucher-2026", { revenue: "1억 원 미만", openedYear: 2020 })).not.toBe("대상 제외");
    expect(result("standing-stability-voucher-2026", { revenue: "3억~10억 원", openedYear: 2020 })).toBe("대상 제외");
    expect(result("standing-stability-voucher-2026", { revenue: "1억 원 미만", openedYear: 2026 })).toBe("대상 제외");
  });
});
describe("상시 지원 제도 확정형·선정형", () => {
  it("요건형은 확정형, 공모형·승인형은 선정형으로 직접 정한다", () => {
    expect(get("standing-durunuri").selection).toBe("확정형");
    expect(get("standing-flexible-work").selection).toBe("선정형");
    expect(all.every((b) => b.selection)).toBe(true);
  });
});
