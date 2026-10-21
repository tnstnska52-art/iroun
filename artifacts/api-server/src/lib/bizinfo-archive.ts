/**
 * 기업마당 지난 공고 모으기 — 고객 화면의 '작년에 놓친 지원금'을 채운다.
 *
 * 기업마당 API 는 게시 중인 공고만 주기 때문에, 마감된 공고는 공고 상세 페이지(공고ID 순번)를 차례로 읽는다.
 * 공고ID 는 한 달에 약 1,000번씩 늘어난다(2024.11 ≈ 102000, 2025.11 ≈ 116500).
 *
 * - 그 해에 접수가 끝난 공고만 남긴다.
 * - 제목으로 고객이 돈으로 받는 공고(지원금·장려금·보조·바우처·임차료·수수료·보험료 등)만 고르고,
 *   교육·행사·기관 모집처럼 돈을 주지 않는 공고는 읽기만 하고 넣지 않는다(AI 정리 비용을 아낀다).
 * - 공개 여부는 다른 공고와 똑같이 AI 정리가 정한다.
 * - 한 번에 정해진 개수만 읽고 다음 번호를 저장해 두었다가 이어서 읽는다.
 */
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { excludedCategory } from "./benefit-domain";
import { parseBizinfoRecord, structureBizinfo } from "./official-feed";
import { refreshOfficialCheck, sameSnapshot, stageOfficialNotice } from "./official-ingestion";
import { reserveFeedCall, storeFeedState, storedFeedState } from "./public-feeds";

const DETAIL = "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=";
/** 연도별 공고ID 범위(앞뒤로 한 달 여유). 접수 마감이 그 해인 공고가 들어 있는 구간. */
export const ARCHIVE_RANGE: Record<number, [number, number]> = { 2025: [102000, 117800] };

const pid = (n: number) => `PBLN_${String(n).padStart(15, "0")}`;
const plain = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** 상세 페이지 HTML → 기업마당 API 응답과 같은 모양의 레코드. 공고가 없으면 null. */
export function parseBizinfoDetail(html: string, id: string): Record<string, string> | null {
  const title = html.match(/<h2 class="title">([\s\S]*?)<\/h2>/)?.[1];
  if (!title) return null;
  const item = (label: string) => {
    const re = new RegExp(`<span class="s_title">\\s*${label}\\s*</span>\\s*<div class="txt">([\\s\\S]*?)</div>\\s*</li>`);
    const m = html.match(re);
    return m ? plain(m[1]) : "";
  };
  const category = plain(html.match(/<div class="category">\s*<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
  const registered = html.match(/<div class="top_info">\s*<ul>\s*<li>\s*([\d.]+)/)?.[1] ?? "";
  const tags = [...html.matchAll(/<li class="tag_li_list\d+"><span>#([^<]+)<\/span><\/li>/g)].map((m) => m[1]).join(",");
  return {
    pblancId: id, pblancNm: plain(title), pblancUrl: DETAIL + id,
    jrsdInsttNm: item("소관부처·지자체") || item("소관부처") || "기업마당", excInsttNm: item("사업수행기관"),
    reqstBeginEndDe: item("신청기간"), bsnsSumryCn: item("사업개요"), reqstMthPapersCn: item("사업신청 방법"),
    refrncNm: item("문의처"), pldirSportRealmLclasCodeNm: category || "확인 필요", creatPnttm: registered, hashtags: tags,
  };
}

/** 고객이 돈으로 받는 공고로 보이는 제목 */
const MONEY_TITLE = /지원금|장려금|보조|바우처|임차료|임대료|월세|수수료|보험료|감면|환급|이자|수당|상품권|캐시백|페이백|인건비|구입비|설치비|개선\s*(사업|지원)|간판|시설\s*개선|환경\s*개선|경영\s*안정|재기|폐업|소상공인|자영업|1인|청년\s*(창업|사업자)|창업\s*(자금|지원금)|일자리\s*(창출|안정)|고용\s*(장려|안정|유지)|에너지|전기\s*요금|공과금|배달|카드|점포|노란우산|사회\s*보험|두루누리/;
/** 돈을 주지 않는 공고(교육·행사·기관 모집·융자) */
const NOT_MONEY_TITLE = /교육(생)?\s*(모집|과정|안내)|아카데미|컨설팅|멘토링|박람회|전시회|설명회|세미나|포럼|간담회|상담회|공모전|경진\s*대회|입주|(주관|운영|수행|전담|위탁)\s*기관|운영\s*(사|단체)\s*(모집|선정)|평가\s*위원|심사\s*위원|전문가\s*(풀|모집)|융자|대출|보증|정책\s*자금|이차\s*보전|결과\s*(공고|발표)|선정\s*결과|합격자|취소\s*공고/;
export const archiveWorthy = (title: string) => MONEY_TITLE.test(title) && !NOT_MONEY_TITLE.test(title);

const endYear = (period: string) => {
  const ds = [...period.matchAll(/(\d{4})[.-](\d{2})[.-](\d{2})/g)];
  return ds.length >= 2 ? Number(ds[ds.length - 1][1]) : NaN;
};

export async function runBizinfoArchive(fetcher: typeof fetch = fetch, opts: { year?: number; batch?: number; restart?: boolean } = {}) {
  const year = opts.year ?? new Date().getFullYear() - 1;
  const range = ARCHIVE_RANGE[year];
  if (!range) return { blocked: true, reason: `${year}년 공고ID 범위가 정해지지 않았습니다.` };
  const stateKey = `bizinfo:archive:${year}`;
  const prior = await storedFeedState(stateKey) as Record<string, unknown>;
  if (prior.lastSuccess && !opts.restart) return { done: true, ...prior };
  const daily = Math.max(100, Number(process.env.IROUN_BIZINFO_ARCHIVE_DAILY) || 8000);
  const batch = Math.min(Math.max(1, opts.batch ?? 2500), 8000);
  const state: Record<string, unknown> = {
    ...prior, status: "수집 중", lastAttempt: new Date().toISOString(),
    nextId: opts.restart ? range[0] : Number(prior.nextId) || range[0], range,
  };
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(84102) AS ok")).rows[0]?.ok === true;
    if (!acquired) return { busy: true };
    const add = (k: string, n = 1) => { state[k] = Number(state[k] ?? 0) + n; };
    const checkedAt = new Date().toISOString();
    let next = Number(state.nextId);
    const stop = Math.min(range[1] + 1, next + batch);
    const one = async (n: number) => {
      const id = pid(n);
      const r = await fetcher(DETAIL + id, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Mozilla/5.0 (iroun benefits archive)" } });
      add("read");
      if (r.status === 404) { add("missing"); return; }
      if (!r.ok) throw new Error(`기업마당 HTTP ${r.status}`);
      const raw = parseBizinfoDetail(await r.text(), id);
      if (!raw) { add("missing"); return; }
      if (endYear(raw.reqstBeginEndDe) !== year) { add("outOfYear"); return; }
      if (!archiveWorthy(raw.pblancNm)) { add("skipped"); return; }
      const parsed = parseBizinfoRecord(raw, checkedAt);
      if (excludedCategory(parsed)) { add("excluded"); return; }
      const b = structureBizinfo(parsed, raw).benefit;
      const fingerprint = "archive:" + createHash("sha256").update(JSON.stringify(raw)).digest("hex");
      const snap = await sameSnapshot(b.sourceId, fingerprint);
      if (snap.same) { await refreshOfficialCheck(b.sourceId, b.checkedAt); add("unchanged"); return; }
      const result = await stageOfficialNotice(b, "official-bizinfo-archive", { sourceRecord: raw, baselineOnly: !snap.exists, contentHash: fingerprint });
      add(result.reused ? "updated" : "created");
    };
    // 기업마당에 부담을 주지 않게 3개씩 천천히 읽는다.
    while (next < stop) {
      if (!await reserveFeedCall("bizinfo:archive", daily)) { state.reason = "오늘 읽을 수 있는 개수를 다 읽었습니다. 다음 수집 때 이어서 읽습니다."; break; }
      const ids = [next, next + 1, next + 2].filter((n) => n < stop);
      const results = await Promise.allSettled(ids.map(one));
      const failed = results.filter((x) => x.status === "rejected");
      if (failed.length === ids.length) throw new Error((failed[0] as PromiseRejectedResult).reason?.message ?? "기업마당 읽기 실패");
      add("failed", failed.length);
      next += ids.length;
      state.nextId = next;
      if (next % 300 < 3) await storeFeedState(stateKey, state);
      await new Promise((r) => setTimeout(r, 250));
    }
    if (next > range[1]) Object.assign(state, { status: "완료", lastSuccess: new Date().toISOString(), reason: `${year}년 마감 공고를 끝까지 읽었습니다. 공개 여부는 AI 정리가 정합니다.` });
    else Object.assign(state, { status: "이어서 수집", reason: state.reason ?? `${next}번까지 읽었습니다. 다음 수집 때 이어서 읽습니다.` });
    await storeFeedState(stateKey, state);
    return state;
  } catch (e) {
    Object.assign(state, { status: "확인 필요", reason: (e as Error).message.slice(0, 200) });
    await storeFeedState(stateKey, state);
    throw e;
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(84102)");
    lock.release();
  }
}
