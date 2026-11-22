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
describe("사장님 본인이 받는 것(근로·자녀장려금, 고효율기기, 내일배움카드)", () => {
  const at = (id: string, when: string, biz: Record<string, unknown> = {}) => matchBenefit(get(id), prof(biz), new Date(when))[0]!;
  it("가구 소득·재산과 구입 여부를 알 수 없는 것은 '추가 확인 필요'이고 합계에 들어갈 최대금액을 넣지 않는다", () => {
    for (const id of ["standing-eitc-late-2025", "standing-child-credit-late-2025", "standing-efficient-appliance-2026"]) {
      expect(at(id, "2026-11-22T12:00:00+09:00").result).toBe("추가 확인 필요");
      expect(get(id).maxAmount).toBeUndefined();
    }
    expect(get("standing-learning-card").maxAmount).toBeUndefined();
  });
  it("기한 후 신청은 12월 1일까지이고, 그 뒤에는 대상에서 빠진다", () => {
    expect(at("standing-eitc-late-2025", "2026-12-01T23:00:00+09:00").result).toBe("추가 확인 필요");
    expect(at("standing-eitc-late-2025", "2026-12-02T00:10:00+09:00").result).toBe("대상 제외");
    expect(at("standing-child-credit-late-2025", "2026-12-02T00:10:00+09:00").result).toBe("대상 제외");
  });
  it("2027년 정기 신청은 5월 전에는 '신청기간 전'으로 남는다", () => {
    for (const id of ["standing-eitc-2026", "standing-child-credit-2026"]) {
      expect(at(id, "2026-12-10T12:00:00+09:00").unknowns).toContain("아직 신청기간 전입니다.");
      expect(at(id, "2027-05-03T12:00:00+09:00").unknowns).not.toContain("아직 신청기간 전입니다.");
      expect(at(id, "2027-06-01T00:10:00+09:00").result).toBe("대상 제외");
    }
  });
  it("고효율기기: 12월 31일까지, 예산은 확인 필요", () => {
    expect(at("standing-efficient-appliance-2026", "2026-12-31T20:00:00+09:00").unknowns).toContain("예산 잔여를 확인해 주세요.");
    expect(at("standing-efficient-appliance-2026", "2027-01-01T00:10:00+09:00").result).toBe("대상 제외");
  });
  it("내일배움카드: 사업 1년 이상·연매출 4억 원 미만", () => {
    const when = "2026-11-22T12:00:00+09:00";
    expect(at("standing-learning-card", when, { revenue: "1억 원 미만", openedYear: 2020 }).result).toBe("조건 일치");
    expect(at("standing-learning-card", when, { revenue: "10억 원 이상", openedYear: 2020 }).result).toBe("대상 제외");
    expect(at("standing-learning-card", when, { revenue: "1억 원 미만", openedYear: 2026 }).result).toBe("대상 제외");
    expect(at("standing-learning-card", when, { revenue: "3억~10억 원", openedYear: 2020 }).result).toBe("추가 확인 필요");
  });
});
describe("상시 지원 제도 확정형·선정형", () => {
  it("요건형은 확정형, 공모형·승인형은 선정형으로 직접 정한다", () => {
    expect(get("standing-durunuri").selection).toBe("확정형");
    expect(get("standing-flexible-work").selection).toBe("선정형");
    expect(all.every((b) => b.selection)).toBe(true);
  });
});
