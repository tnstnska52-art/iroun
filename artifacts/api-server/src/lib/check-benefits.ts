// 홈페이지 지원금 확인(irowoon.com/check)용 가벼운 공고 목록.
// 전체 목록(/api/benefits)은 8MB 가까이 되고 압축도 없어 모바일에서 '공고를 불러오는 중'이 오래 걸렸다.
// 화면에서 쓰지 않는 필드를 빼고, 지금 신청 가능한 공고(open)와 마감된 공고(past)를 나눠서 gzip 으로 보낸다.
// 만든 결과는 5분 동안 메모리에 두고 같이 쓴다(공고는 1시간마다 수집되므로 충분히 새롭다).
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export type CheckPart = "open" | "past" | "all";
/** 홈페이지 화면이 쓰지 않는 무거운 필드(AI 추출 원문·계산 근거·내부 상태) */
const DROP = new Set(["extraction", "calculation", "sourceId", "isTest", "reviewStatus"]);

export function slimBenefit(b: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (DROP.has(k)) continue;
    o[k] = k === "checkedAt" && typeof v === "string" ? v.slice(0, 10) : v;
  }
  return o;
}

export function partOf(b: { status?: unknown; endsAt?: unknown }, now = new Date()): "open" | "past" | null {
  if (b.status !== "마감") return "open";
  // 마감 공고는 '작년·올해 놓친 지원금' 계산에만 쓴다. 그보다 오래된 것은 보내지 않는다.
  const y = typeof b.endsAt === "string" && /^\d{4}/.test(b.endsAt) ? Number(b.endsAt.slice(0, 4)) : null;
  return y !== null && y >= now.getFullYear() - 1 ? "past" : null;
}

export function buildCheckList(items: Record<string, unknown>[], part: CheckPart, now = new Date()) {
  return items.filter((b) => { const p = partOf(b, now); return p !== null && (part === "all" || p === part); }).map(slimBenefit);
}

type Packed = { at: number; etag: string; json: Buffer; gz: Buffer; count: number };
const cache = new Map<CheckPart, Packed>();
const building = new Map<CheckPart, Promise<Packed>>();
export const CHECK_CACHE_MS = 5 * 60 * 1000;

export function pack(list: unknown[]): Packed {
  const json = Buffer.from(JSON.stringify(list));
  return { at: Date.now(), etag: `"${createHash("sha1").update(json).digest("base64url")}"`, json, gz: gzipSync(json, { level: 9 }), count: list.length };
}

/** 5분 캐시. 만료돼도 새로 만드는 동안 직전 결과를 바로 준다(첫 요청만 기다린다). */
export async function checkList(part: CheckPart, load: () => Promise<Record<string, unknown>[]>) {
  const hit = cache.get(part);
  const refresh = () => {
    let p = building.get(part);
    if (!p) {
      p = load().then((items) => { const v = pack(buildCheckList(items, part)); cache.set(part, v); return v; }).finally(() => building.delete(part));
      building.set(part, p);
    }
    return p;
  };
  if (hit && Date.now() - hit.at < CHECK_CACHE_MS) return hit;
  if (hit) { void refresh().catch(() => undefined); return hit; }
  return refresh();
}
export const clearCheckCache = () => cache.clear();
