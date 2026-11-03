import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { requiresPackageContract, visibleToCustomer } from "./benefit-visibility";
import { trustedCatalogRequest } from "./catalog-auth";
import { buildCheckList, checkList, clearCheckCache } from "./check-benefits";

const insurance = { id: "standing-self-employed-insurance", title: "소상공인 고용보험료 지원", status: "상시 조회" };
const normal = { id: "ordinary", title: "소상공인 경영안정 바우처", status: "상시 조회" };

describe("지원금패키지 계약 전용 고용보험", () => {
  it.each([
    "2026년 소상공인 고용보험료 지원사업 공고",
    "[제주] 2026년 소상공인 고용보험료 지원 사업 공고",
    "서울특별시 자영업자 고용보험료 지원",
    "소상공인 고용보험 가입 지원",
    "[충남] 2026년 2차 1인 자영업자 고용보험료 지원사업 수정 공고",
  ])("지역·수집 출처에 상관없이 적용 %s", title => {
    expect(requiresPackageContract({ title })).toBe(true);
  });
  it.each(["두루누리 사회보험료 지원", "직원 고용보험료 지원", "고용촉진장려금", "소상공인 경영안정 바우처"])("다른 사업은 유지 %s", title => {
    expect(visibleToCustomer({ title })).toBe(true);
  });
  it("로그인·무료권·체험권·일반 구독만으로는 열리지 않는다", () => {
    for (const access of [undefined, { active: false }, { active: true }, { active: true, contractActive: false }, { active: false, contractActive: true }]) {
      expect(visibleToCustomer(insurance, access)).toBe(false);
      expect(visibleToCustomer(normal, access)).toBe(true);
    }
    expect(visibleToCustomer(insurance, { active: true, contractActive: true })).toBe(true);
  });
  it("일반 목록과 서명된 전산 목록의 캐시를 분리한다", async () => {
    clearCheckCache();
    const load = async () => [insurance, normal];
    const [privateList, publicList] = await Promise.all([checkList("open", load, true), checkList("open", load)]);
    expect(JSON.parse(privateList.json.toString())).toHaveLength(2);
    expect(JSON.parse(publicList.json.toString())).toEqual([normal]);
    expect(privateList.etag).not.toBe(publicList.etag);
    expect(buildCheckList([{ ...insurance, status: "마감", endsAt: "2026-01-01" }], "past", new Date("2026-11-03"))).toEqual([]);
  });
  it("유효한 서버 서명만 계약 공고 조회를 허용한다", () => {
    const secret = "a".repeat(64), timestamp = "1793664000", path = "/api/public/check-benefits?part=open";
    const signature = createHmac("sha256", secret).update(`${timestamp}\nGET\n${path}\n`).digest("hex");
    const input = { timestamp, path, signature, method: "GET" }, now = Number(timestamp) * 1000;
    expect(trustedCatalogRequest(input, secret, now)).toBe(true);
    for (const changed of [{ signature: "b".repeat(64) }, { path: path + "&contract=true" }, { origin: "https://www.irowoon.com" }, { method: "POST" }, { timestamp: "bad" }]) {
      expect(trustedCatalogRequest({ ...input, ...changed }, secret, now)).toBe(false);
    }
    expect(trustedCatalogRequest(input, secret, now + 301000)).toBe(false);
    expect(trustedCatalogRequest(input, "", now)).toBe(false);
  });
});
