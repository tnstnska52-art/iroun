import { describe, expect, it } from "vitest";
import { docMatchKey } from "./doc-kinds";
describe("서류 종류 맞추기", () => {
  it("같은 종류는 같은 열쇠, 등본과 초본은 다르다", () => {
    expect(docMatchKey("사업자등록증")).toBe(docMatchKey("사업자 등록증명원"));
    expect(docMatchKey("주민등록표 등본")).not.toBe(docMatchKey("주민등록초본"));
    expect(docMatchKey("통장사본")).toBe(docMatchKey("통장 사본(대표자 명의)"));
    expect(docMatchKey("사업 계획서")).toBe(docMatchKey("사업계획서"));
    expect(docMatchKey("사업 계획서")).not.toBe(docMatchKey("견적서"));
  });
});
