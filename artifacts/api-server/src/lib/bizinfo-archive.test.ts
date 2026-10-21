import { describe, expect, it } from "vitest";
import { archiveWorthy, parseBizinfoDetail } from "./bizinfo-archive";
import { parseBizinfoRecord } from "./official-feed";

const html = `<div class="title_area"><div style="float:left;"><div class="category">
<span class="c-blue">경영</span></div><h2 class="title">[충북] 충주시 2025년 청년소상공인 창업점포임차료 지원사업 공고</h2></div></div>
<div class="top_info"><ul><li>
  2025.05.29
</li><li>스크랩 0</li></ul></div>
<div class="view_cont"><ul>
<li><span class="s_title">소관부처·지자체</span><div class="txt">충청북도</div></li>
<li><span class="s_title">사업수행기관</span><div class="txt">
  기초자치단체
</div></li>
<li><span class="s_title">신청기간</span><div class="txt">
  2025.05.21 ~
  2025.06.04 &nbsp;
</div></li>
<li><span class="s_title">사업개요</span><div class="txt"><p>청년 초기 창업자 임차료 지원</p><p>☞&nbsp;업체당 임차료(월세)의 50% 이내 지원(최대 30만원)</p></div></li>
<li><span class="s_title">문의처</span><div class="txt">충주시청 경제과 043-850-6015</div></li>
</ul></div>
<ul class="tag_ul_list"><li class="tag_li_list0"><span>#임차료</span></li><li class="tag_li_list1"><span>#충주시</span></li></ul>`;

describe("기업마당 지난 공고 상세 페이지", () => {
  it("상세 페이지를 API 레코드 모양으로 읽는다", () => {
    const r = parseBizinfoDetail(html, "PBLN_000000000110000")!;
    expect(r.pblancNm).toBe("[충북] 충주시 2025년 청년소상공인 창업점포임차료 지원사업 공고");
    expect(r.jrsdInsttNm).toBe("충청북도");
    expect(r.excInsttNm).toBe("기초자치단체");
    expect(r.reqstBeginEndDe).toMatch(/2025\.05\.21 ~\s*2025\.06\.04/);
    expect(r.bsnsSumryCn).toContain("최대 30만원");
    expect(r.pldirSportRealmLclasCodeNm).toBe("경영");
    expect(r.hashtags).toBe("임차료,충주시");
    const b = parseBizinfoRecord(r);
    expect(b.startsAt).toBe("2025-05-21");
    expect(b.endsAt).toBe("2025-06-04");
    expect(b.sourceUrl).toContain("PBLN_000000000110000");
  });
  it("없는 공고는 null", () => expect(parseBizinfoDetail("<html>없음</html>", "PBLN_1")).toBeNull());
  it.each([
    ["[충북] 충주시 2025년 청년소상공인 창업점포임차료 지원사업 공고", true],
    ["[부산] 2025년 소상공인 카드수수료 지원사업", true],
    ["2025년 소상공인 디지털 역량 교육생 모집", false],
    ["2025년 강한 소상공인 성장지원사업 주관기관 모집 공고", false],
    ["[경기] 2025년 중소기업 육성자금 융자 지원", false],
    ["2025년 스마트공장 구축 기술 세미나", false],
  ])("%s → %s", (t, want) => expect(archiveWorthy(t)).toBe(want));
});
