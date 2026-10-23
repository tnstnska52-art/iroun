import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { buildCheckList, checkList, clearCheckCache, pack, partOf, slimBenefit } from "./check-benefits";

const now = new Date("2026-10-23T00:00:00Z");
const b = (id: string, status: string, endsAt: string | null) => ({ id, status, endsAt, title: id, extraction: { big: "x".repeat(1000) }, calculation: {}, sourceId: "s", isTest: false, reviewStatus: "ok", checkedAt: "2026-10-22T21:02:00.936Z", rules: [], fit: { small: 1 } });

describe("홈페이지 지원금 확인용 가벼운 목록", () => {
  it("쓰지 않는 무거운 필드를 빼고 확인 날짜는 날짜만 남긴다", () => {
    const s = slimBenefit(b("a", "접수 중", null));
    expect(Object.keys(s).sort()).toEqual(["checkedAt", "endsAt", "fit", "id", "rules", "status", "title"]);
    expect(s.checkedAt).toBe("2026-10-22");
  });
  it("지금 신청 가능(open)과 작년·올해 마감(past)으로 나누고, 더 오래된 마감은 뺀다", () => {
    expect(partOf(b("a", "접수 중", "2027-01-01"), now)).toBe("open");
    expect(partOf(b("a", "상시 조회", null), now)).toBe("open");
    expect(partOf(b("a", "마감", "2025-03-01"), now)).toBe("past");
    expect(partOf(b("a", "마감", "2024-12-31"), now)).toBeNull();
    expect(partOf(b("a", "마감", null), now)).toBeNull();
    const all = [b("o", "접수 중", null), b("p", "마감", "2026-01-05"), b("x", "마감", "2021-01-01")];
    expect(buildCheckList(all, "open", now).map((x) => x.id)).toEqual(["o"]);
    expect(buildCheckList(all, "past", now).map((x) => x.id)).toEqual(["p"]);
    expect(buildCheckList(all, "all", now).map((x) => x.id)).toEqual(["o", "p"]);
  });
  it("gzip 으로 줄어들고 풀면 원래 JSON 이다", () => {
    const list = Array.from({ length: 200 }, (_, i) => slimBenefit(b("id" + i, "접수 중", null)));
    const v = pack(list);
    expect(v.gz.length).toBeLessThan(v.json.length / 5);
    expect(JSON.parse(gunzipSync(v.gz).toString())).toEqual(list);
    expect(v.etag).toMatch(/^".+"$/);
  });
  it("5분 안에는 DB 를 다시 읽지 않고, 동시에 와도 한 번만 읽는다", async () => {
    clearCheckCache(); let loads = 0;
    const load = async () => { loads++; return [b("o", "접수 중", null)]; };
    const [x, y] = await Promise.all([checkList("open", load), checkList("open", load)]);
    expect(x).toBe(y); await checkList("open", load);
    expect(loads).toBe(1);
  });
});
