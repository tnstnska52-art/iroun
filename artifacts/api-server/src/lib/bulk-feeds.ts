/**
 * 대량 수집: 정부24 사업자 대상 서비스 전체, K-Startup 모집 중 공고 전체.
 * 그리고 출처가 달라도 같은 사업이면 하나만 공개하는 중복 정리.
 *
 * - 정부24: 하루 한 번 목록·상세·조건 전체를 큰 쪽수로 읽고(약 40~60회 호출),
 *   사용자구분이 소상공인·법인인 서비스만 검토대기로 넣는다. 공개 여부는 AI 정리가 정한다.
 * - K-Startup: 창업진흥원 공공데이터 API. IROUN_KSTARTUP_APPROVED=true 일 때만.
 *   인증키는 KSTARTUP_API_KEY, 없으면 같은 공공데이터포털 계정 키(GOV24_API_KEY)를 쓴다.
 *   (공공데이터포털에서 'K-Startup 조회서비스' 활용신청을 해야 그 키로 호출된다.)
 */
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { audit } from "./benefit-store";
import { benefitSchema, excludedCategory, officialUrl, type Benefit } from "./benefit-domain";
import { refreshOfficialCheck, sameSnapshot, stableRecord, stageOfficialNotice } from "./official-ingestion";
import { catalog, mapPublicBenefit, rows, text, type Row } from "./public-feed-model";
import { storedFeedState, storeFeedState } from "./public-feeds";
import { logger } from "./logger";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
const hash = (v: unknown) => "v2:" + createHash("sha256").update(canonical(stableRecord(v))).digest("hex");
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

async function reserve(source: string, limit: number) {
  return !!(await pool.query(`INSERT INTO iroun_public_feed_quota(source,day,calls) VALUES($1,(now() AT TIME ZONE 'Asia/Seoul')::date,1)
    ON CONFLICT(source,day) DO UPDATE SET calls=iroun_public_feed_quota.calls+1 WHERE iroun_public_feed_quota.calls<$2 RETURNING calls`, [source, limit])).rowCount;
}
function serviceKey(...names: string[]) {
  const raw = names.map((n) => process.env[n]?.trim()).find(Boolean);
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/* ===================== 정부24 사업자 서비스 전체 ===================== */
export const gov24BulkReady = () => process.env.IROUN_OFFICIAL_FEEDS_ENABLED === "true" && process.env.IROUN_GOV24_APPROVED === "true"
  && !!serviceKey(catalog.gov24.key, "DATA_GO_KR_SERVICE_KEY") && process.env.IROUN_GOV24_BULK !== "false";
export const isBusinessService = (r: Row) => /소상공인|법인/.test(text(r["사용자구분"]));

export async function runGov24Bulk(fetcher: typeof fetch = fetch, force = false) {
  if (!gov24BulkReady()) return { blocked: true, reason: "정부24 활용승인·인증키·수집 설정 필요" };
  const prior = await storedFeedState("gov24:bulk") as Record<string, unknown>;
  if (!force && prior.lastSuccessDay === kstDay()) return { skipped: true, reason: "오늘 이미 전체 수집함" };
  const key = serviceKey(catalog.gov24.key, "DATA_GO_KR_SERVICE_KEY");
  const daily = Math.max(1, Number(process.env.IROUN_GOV24_DAILY_LIMIT) || 1000);
  const lock = await pool.connect();
  let acquired = false;
  const state: Record<string, unknown> = { ...prior, lastAttempt: new Date().toISOString(), calls: 0, services: 0, business: 0, created: 0, updated: 0, unchanged: 0, excluded: 0, invalid: 0, status: "수집 중" };
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(84100) AS ok")).rows[0]?.ok === true;
    if (!acquired) return { busy: true };
    async function all(path: string, perPage: number) {
      const out: Row[] = [];
      for (let page = 1; page <= 60; page++) {
        if (!await reserve("gov24", daily)) throw new Error("오늘 정부24 호출 한도 도달");
        const url = new URL(path, catalog.gov24.base);
        url.search = new URLSearchParams({ page: String(page), perPage: String(perPage), returnType: "JSON", serviceKey: key }).toString();
        const r = await fetcher(url, { signal: AbortSignal.timeout(60000) });
        state.calls = Number(state.calls) + 1;
        if (!r.ok) throw new Error(`정부24 ${path} HTTP ${r.status}`);
        const body = await r.text();
        if (body.length > 20_000_000) throw new Error("정부24 응답 크기 초과");
        const parsed = JSON.parse(body) as { data?: unknown; totalCount?: number };
        const data = rows(parsed.data);
        out.push(...data);
        if (data.length < perPage || out.length >= Number(parsed.totalCount ?? 0)) break;
      }
      return out;
    }
    const list = await all("serviceList", 1000);
    state.services = list.length;
    const business = list.filter(isBusinessService);
    state.business = business.length;
    if (!business.length) throw new Error("정부24 사업자 서비스 목록이 비었습니다.");
    const details = new Map((await all("serviceDetail", 500)).map((d) => [text(d["서비스ID"]), d]));
    const conditions = new Map((await all("supportConditions", 1000)).map((d) => [text(d["서비스ID"]), d]));
    const checkedAt = new Date().toISOString();
    for (const item of business) {
      const id = text(item["서비스ID"]);
      const detail = details.get(id);
      if (!id || !detail) { state.invalid = Number(state.invalid) + 1; continue; }
      const cond = conditions.get(id) ?? {};
      let b: Benefit;
      try { b = mapPublicBenefit("gov24", item, detail, cond, checkedAt); } catch { state.invalid = Number(state.invalid) + 1; continue; }
      if (excludedCategory(b)) { state.excluded = Number(state.excluded) + 1; continue; }
      // 시간당 소량 수집과 같은 형태로 지문을 만들어 같은 자료를 '변경'으로 보지 않게 한다.
      const sourceRecord = { list: item, detail, conditions: cond };
      const fingerprint = hash(sourceRecord);
      const snap = await sameSnapshot(b.sourceId, fingerprint);
      const old = snap.exists;
      if (snap.same) { await refreshOfficialCheck(b.sourceId, b.checkedAt, b.sourceUrl, false); state.unchanged = Number(state.unchanged) + 1; continue; }
      try {
        const result = await stageOfficialNotice(b, "official-gov24-bulk", { sourceRecord, baselineOnly: !old, contentHash: fingerprint });
        if (result.reused) state.updated = Number(state.updated) + 1; else state.created = Number(state.created) + 1;
      } catch { state.invalid = Number(state.invalid) + 1; }
    }
    Object.assign(state, { status: "검토대기", lastSuccess: new Date().toISOString(), lastSuccessDay: kstDay(), reason: "정부24 사업자 대상 서비스 전체를 읽었습니다. 공개 여부는 AI 정리가 정합니다." });
    await storeFeedState("gov24:bulk", state);
    return state;
  } catch (e) {
    Object.assign(state, { status: "확인 필요", reason: (e as Error).message.slice(0, 200) });
    await storeFeedState("gov24:bulk", state);
    throw e;
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(84100)");
    lock.release();
  }
}

/* ===================== K-Startup ===================== */
export const KSTARTUP_DOC = "https://www.data.go.kr/data/15125364/openapi.do";
const KSTARTUP_URL = "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01";
export const kstartupReady = () => process.env.IROUN_OFFICIAL_FEEDS_ENABLED === "true" && process.env.IROUN_KSTARTUP_APPROVED === "true"
  && !!serviceKey("KSTARTUP_API_KEY", catalog.gov24.key, "DATA_GO_KR_SERVICE_KEY");

const ymd = (v: unknown) => { const m = text(v).replace(/[^0-9]/g, "").match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };
const pick = (r: Row, ...keys: string[]) => keys.map((k) => text(r[k])).find(Boolean) ?? "";

/** K-Startup 공고 1건 → 공고. 순수 함수(테스트 대상). */
export function mapKstartup(r: Row, checkedAt = new Date().toISOString()): Benefit {
  const sn = pick(r, "pbanc_sn", "biz_pbanc_sn");
  const title = pick(r, "biz_pbanc_nm", "intg_pbanc_biz_nm");
  const agency = pick(r, "pbanc_ntrp_nm", "sprv_inst", "biz_prch_dprt_nm") || "창업진흥원";
  let url = pick(r, "detl_pg_url", "biz_aply_url");
  if (!officialUrl(url) && sn) url = `https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=${encodeURIComponent(sn)}`;
  if (!/^\d+$/.test(sn) || !title || !officialUrl(url)) throw new Error("K-Startup 식별자·제목·원문 주소 확인 필요");
  const content = pick(r, "pbanc_ctnt");
  const lines = [
    ["지원분야", pick(r, "supt_biz_clsfc")], ["지원지역", pick(r, "supt_regin")], ["신청대상", pick(r, "aply_trgt")],
    ["대상 상세", pick(r, "aply_trgt_ctnt")], ["업력", pick(r, "biz_enyy")], ["대상 연령", pick(r, "biz_trgt_age")],
    ["우대사항", pick(r, "prfn_matr")], ["신청방법", pick(r, "aply_mthd_onli_rcpt_istc", "aply_mthd_vst_rcpt_istc", "aply_mthd_etc_istc")],
    ["문의", pick(r, "prch_cnpl_no")],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`.slice(0, 500));
  const region = pick(r, "supt_regin");
  return benefitSchema.parse({
    id: `kstartup-${sn}`, sourceId: `kstartup:${sn}`, title: title.slice(0, 200), kind: "지원금", audience: "사업",
    category: (pick(r, "supt_biz_clsfc") || "창업").slice(0, 60),
    region: /전국/.test(region) || !region ? "전국" : "관할 확인 필요",
    agency: agency.slice(0, 100), sourceUrl: url,
    summary: (content || lines.join(" / ") || "공식 원문에서 지원 내용을 확인해 주세요.").slice(0, 1000),
    support: (content || "공식 원문 확인 필요").slice(0, 5000),
    calculation: "지원 내용·한도는 공식 공고를 검토해야 합니다. 개인 예상액이나 합산 금액이 아닙니다.",
    checks: lines.slice(0, 50), documents: [],
    startsAt: ymd(r.pbanc_rcpt_bgng_dt), endsAt: ymd(r.pbanc_rcpt_end_dt), checkedAt,
    budgetStatus: "확인 필요", status: "확인 필요", reviewStatus: "검토대기", isTest: false, rules: [],
  });
}

/**
 * K-Startup 공고 수집.
 * archiveYear 를 주면 그 해에 접수가 끝난(마감된) 공고를 모은다. 고객 화면의 '작년에 놓친 지원금'에 쓴다.
 * 기업마당 API 는 최신 공고만 주고 기간 검색이 없어서, 과거 공고는 기간 조회가 되는 K-Startup 으로 채운다.
 */
export async function runKstartup(fetcher: typeof fetch = fetch, opts: { archiveYear?: number; maxPages?: number } = {}) {
  const archive = opts.archiveYear;
  const stateKey = archive ? `kstartup:archive:${archive}` : "kstartup";
  if (!kstartupReady()) return { blocked: true, reason: "K-Startup 활용신청·수집 승인(IROUN_KSTARTUP_APPROVED) 필요" };
  const key = serviceKey("KSTARTUP_API_KEY", catalog.gov24.key, "DATA_GO_KR_SERVICE_KEY");
  const daily = Math.max(1, Number(process.env.IROUN_KSTARTUP_DAILY_LIMIT) || 2000);
  const lock = await pool.connect();
  let acquired = false;
  const prior = await storedFeedState(stateKey) as Record<string, unknown>;
  const state: Record<string, unknown> = { ...prior, lastAttempt: new Date().toISOString(), calls: 0, seen: 0, created: 0, updated: 0, unchanged: 0, excluded: 0, invalid: 0, status: "수집 중" };
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(84101) AS ok")).rows[0]?.ok === true;
    if (!acquired) return { busy: true };
    const checkedAt = new Date().toISOString();
    const lastPage = Math.min(opts.maxPages ?? (archive ? 200 : 30), 300);
    for (let page = 1; page <= lastPage; page++) {
      if (!await reserve("kstartup", daily)) throw new Error("오늘 K-Startup 호출 한도 도달");
      const url = new URL(KSTARTUP_URL);
      const progress = archive ? "N" : "Y";
      url.search = new URLSearchParams({ serviceKey: key, page: String(page), perPage: "100", returnType: "json", rcrt_prgs_yn: progress, "cond[rcrt_prgs_yn::EQ]": progress }).toString();
      const r = await fetcher(url, { signal: AbortSignal.timeout(30000) });
      state.calls = Number(state.calls) + 1;
      const body = await r.text();
      if (!r.ok) throw new Error(`K-Startup HTTP ${r.status}${/SERVICE_KEY|등록되지|not registered|unauthorized/i.test(body) ? " (활용신청·키 확인 필요)" : ""}`);
      let parsed: { data?: unknown; totalCount?: number; response?: { body?: { items?: { item?: unknown } } } };
      try { parsed = JSON.parse(body); } catch { throw new Error(`K-Startup 응답이 JSON 이 아님${/SERVICE_KEY|등록되지/.test(body) ? " (활용신청·키 확인 필요)" : ""}`); }
      const data = rows(parsed.data ?? parsed.response?.body?.items?.item);
      if (page === 1 && !data.length) throw new Error(archive ? "K-Startup 마감 공고가 비었습니다." : "K-Startup 모집 중 공고가 비었습니다.");
      for (const item of data) {
        state.seen = Number(state.seen) + 1;
        if (!archive && text(item.rcrt_prgs_yn) && text(item.rcrt_prgs_yn) !== "Y") continue;
        // 과거 수집은 그 해에 접수가 끝난 공고만 남긴다.
        if (archive && ymd(item.pbanc_rcpt_end_dt).slice(0, 4) !== String(archive)) { state.outOfYear = Number(state.outOfYear ?? 0) + 1; continue; }
        let b: Benefit;
        try { b = mapKstartup(item, checkedAt); } catch { state.invalid = Number(state.invalid) + 1; if (!state.sampleKeys) state.sampleKeys = Object.keys(item).slice(0, 40); continue; }
        if (excludedCategory(b)) { state.excluded = Number(state.excluded) + 1; continue; }
        const fingerprint = hash(item);
        const snap = await sameSnapshot(b.sourceId, fingerprint);
        const old = snap.exists;
        if (snap.same) { await refreshOfficialCheck(b.sourceId, b.checkedAt, b.sourceUrl, false); state.unchanged = Number(state.unchanged) + 1; continue; }
        try {
          const result = await stageOfficialNotice(b, "official-kstartup-worker", { sourceRecord: item, baselineOnly: !old, contentHash: fingerprint });
          if (result.reused) state.updated = Number(state.updated) + 1; else state.created = Number(state.created) + 1;
        } catch { state.invalid = Number(state.invalid) + 1; }
      }
      if (data.length < 100 || Number(state.seen) >= Number(parsed.totalCount ?? Infinity)) break;
    }
    Object.assign(state, { status: "검토대기", lastSuccess: new Date().toISOString(), reason: archive ? `K-Startup ${archive}년 마감 공고를 읽었습니다. 공개 여부는 AI 정리가 정합니다.` : "K-Startup 모집 중 공고를 읽었습니다. 공개 여부는 AI 정리가 정합니다." });
    await storeFeedState(stateKey, state);
    return state;
  } catch (e) {
    Object.assign(state, { status: "확인 필요", reason: (e as Error).message.slice(0, 200) });
    await storeFeedState(stateKey, state);
    throw e;
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(84101)");
    lock.release();
  }
}

/* ===================== 출처 간 중복 정리 ===================== */
const PRIORITY = ["bizinfo-", "kstartup-", "gov24-"];
const rank = (b: Benefit) => { const i = PRIORITY.findIndex((p) => b.id.startsWith(p)); return i < 0 ? PRIORITY.length : i; };
export function normTitle(t: string) {
  return t.normalize("NFKC")
    .replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>|「|」|『|』|【[^】]*】/g, " ")
    .replace(/20\d\d\s*(년도|년)?|\d+\s*차|재공고|추가\s*모집|연장|변경|공고|모집|안내|참여\s*기업|참여자|신청|접수|하반기|상반기/g, " ")
    .replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
}
/** 같은 출처 안 비교용: 연도·차수는 남긴다(2022년 지정 ≠ 2023년 지정, 2차 ≠ 3차). */
export function strictTitle(t: string) {
  return t.normalize("NFKC").replace(/\[[^\]]*\]|「|」|『|』/g, " ").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
}
const normAgency = (a: string) => a.normalize("NFKC").replace(/\s+/g, "").replace(/^(주식회사|\(주\)|재단법인|\(재\)|사단법인)/, "");

/** 같은 사업으로 보이는 공개 공고 묶음 → {중복 id: 대표 id}. 순수 함수(테스트 대상). */
export function findDuplicates(list: Benefit[]): Map<string, string> {
  // 이미 중복으로 숨긴 공고도 후보에 넣어야 '중복 해제'로 잘못 되살리지 않는다.
  const items = list.filter((b) => (b.reviewStatus === "공개" || !!b.duplicateOf) && !b.isTest && b.audience === "사업")
    .map((b) => ({ b, t: normTitle(b.title), st: strictTitle(b.title), a: normAgency(b.agency), src: rank(b) }))
    .filter((x) => x.t.length >= 4);
  const parent = new Map<string, string>();
  const find = (id: string): string => { const p = parent.get(id) ?? id; if (p === id) return id; const r = find(p); parent.set(id, r); return r; };
  const union = (x: string, y: string) => { const a = find(x), b = find(y); if (a !== b) parent.set(b, a); };
  const same = (x: typeof items[number], y: typeof items[number]) => {
    if (x.b.id.split("-")[0] === y.b.id.split("-")[0]) {
      // 같은 출처 안에서는 제목·기관·마감일이 모두 같을 때만.
      return x.st === y.st && x.a === y.a && x.b.endsAt.slice(0, 10) === y.b.endsAt.slice(0, 10);
    }
    if (x.t === y.t) return x.a === y.a || (!!x.b.endsAt && x.b.endsAt.slice(0, 10) === y.b.endsAt.slice(0, 10));
    const [s, l] = x.t.length <= y.t.length ? [x.t, y.t] : [y.t, x.t];
    return x.a === y.a && s.length >= 8 && l.includes(s);
  };
  const byTitle = new Map<string, typeof items>(), byAgency = new Map<string, typeof items>();
  for (const x of items) {
    (byTitle.get(x.t) ?? byTitle.set(x.t, []).get(x.t)!).push(x);
    (byAgency.get(x.a) ?? byAgency.set(x.a, []).get(x.a)!).push(x);
  }
  for (const group of [...byTitle.values(), ...byAgency.values()]) {
    if (group.length < 2 || group.length > 3000) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (same(group[i]!, group[j]!)) union(group[i]!.b.id, group[j]!.b.id);
  }
  const groups = new Map<string, typeof items>();
  for (const x of items) { const r = find(x.b.id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(x); }
  const out = new Map<string, string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((x, y) => x.src - y.src || y.b.rules.length - x.b.rules.length || (y.b.maxAmount ? 1 : 0) - (x.b.maxAmount ? 1 : 0) || x.b.id.localeCompare(y.b.id));
    for (const x of g.slice(1)) out.set(x.b.id, g[0]!.b.id);
  }
  return out;
}

export async function hideDuplicates() {
  const all = (await pool.query("SELECT data FROM iroun_benefits")).rows.map((r) => r.data as Benefit);
  const dups = findDuplicates(all);
  let hidden = 0, restored = 0;
  // 규칙이 바뀌어 더는 중복이 아닌 공고는 되살려 AI 가 공개 여부를 다시 정하게 한다.
  for (const prev of all) {
    if (!prev.duplicateOf || dups.has(prev.id)) continue;
    const next = benefitSchema.parse({ ...prev, duplicateOf: undefined, stale: true });
    const saved = await pool.query("UPDATE iroun_benefits SET data=$2,updated_at=now() WHERE id=$1 RETURNING id", [prev.id, JSON.stringify(next)]);
    if (saved.rowCount) { restored++; await audit("system:dedupe", "중복 해제", prev.id, { before: { duplicateOf: prev.duplicateOf }, after: { duplicateOf: null } }); }
  }
  for (const [id, keeper] of dups) {
    const prev = all.find((b) => b.id === id)!;
    const next = benefitSchema.parse({ ...prev, reviewStatus: "비공개", duplicateOf: keeper });
    const saved = await pool.query("UPDATE iroun_benefits SET data=$2,updated_at=now() WHERE id=$1 AND data->>'reviewStatus'='공개' RETURNING id", [id, JSON.stringify(next)]);
    if (saved.rowCount) { hidden++; await audit("system:dedupe", "중복 공고 비공개", id, { before: { reviewStatus: prev.reviewStatus }, after: { reviewStatus: "비공개", duplicateOf: keeper } }); }
  }
  if (hidden || restored) logger.info({ hidden, restored }, "중복 공고 정리");
  return { duplicates: dups.size, hidden, restored };
}

export async function bulkFeedStatus() {
  const [g, k] = await Promise.all([storedFeedState("gov24:bulk"), storedFeedState("kstartup")]);
  return [
    { name: "정부24 사업자 서비스(전체)", source: "gov24:bulk", documentation: catalog.gov24.doc, ...g, status: gov24BulkReady() ? (g as Row).status ?? "아직 수집하지 않음" : "미연동" },
    { name: "K-Startup 창업지원 공고", source: "kstartup", documentation: KSTARTUP_DOC, ...k, status: kstartupReady() ? (k as Row).status ?? "아직 수집하지 않음" : "미연동",
      reason: kstartupReady() ? (k as Row).reason ?? "수집 대기" : "공공데이터포털 'K-Startup 조회서비스' 활용신청 후 Render 에 IROUN_KSTARTUP_APPROVED=true 추가 필요" },
  ];
}
