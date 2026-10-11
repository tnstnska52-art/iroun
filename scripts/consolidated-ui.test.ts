import {test} from "node:test";
import assert from "node:assert/strict";
import {endTime,fmtDate} from "../artifacts/iroun-benefits/lib/util";
test("날짜만 있는 마감은 한국 시간 당일 끝",()=>{
 assert.equal(endTime("2026-10-11"),Date.parse("2026-10-11T14:59:59Z"));
 assert.ok(endTime("2026-10-11")!>Date.parse("2026-10-11T12:00:00+09:00"));
});
test("명시적 마감시각은 그대로, 미제공은 0이 아님",()=>{
 assert.equal(endTime("2026-10-11T10:00:00+09:00"),Date.parse("2026-10-11T01:00:00Z"));
 assert.equal(endTime(undefined),null);assert.equal(endTime("미정"),null);
});
test("날짜 표시가 기기 시간대에 따라 전날로 바뀌지 않음",()=>{
 assert.equal(fmtDate("2026-10-11"),"2026년 10월 11일");
});
