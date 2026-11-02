// 계약서 제6조 — 맞춤 사업 안내·알림·고객 선택 기록.
// ③ 새 사업이 안내되거나 마감 7일 전이 되면 알림, ④ 고르지 않은 사업은 마감 전에 다시 알림,
// ⑥ 안내·알림 발송·열람·버튼을 날짜·시간과 함께 기록하고 고객이 볼 수 있게 한다.
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { isWelfare, matchBenefit, publicBenefit, selectionType, type Benefit, type Profile } from "./benefit-domain";
import { finished } from "./company-domain";
import { logger } from "./logger";

type Query = Pick<typeof pool, "query">;
const DAY = 86400000;

/** 기록 종류. 고객 화면에 그대로 보인다. */
export const ACTIVITY = {
  notice: "맞춤 사업 안내",
  alert: "앱 알림 보냄",
  read: "알림 열어 봄",
  view: "공고 열어 봄",
  apply: "신청할게요",
  mismatch: "조건 불일치",
  profile: "내 정보 수정",
} as const;
export type ActivityKind = (typeof ACTIVITY)[keyof typeof ACTIVITY];

/** 알림함 종류 */
export const ALERT = { new: "새 사업", d7: "마감 7일 전", remind: "마감 재알림" } as const;
export const ALERT_TITLE: Record<string, string> = {
  [ALERT.new]: "새 맞춤 사업을 안내해 드려요",
  [ALERT.d7]: "마감 7일 전이에요",
  [ALERT.remind]: "아직 고르지 않은 사업이 곧 마감돼요",
};
/** 재알림 시점: 마감 3일 전부터 */
export const REMIND_DAYS = 3;

export async function logActivity(userId: string, kind: ActivityKind, benefitId: string | null, data: Record<string, unknown> = {}, businessId = "", client: Query = pool) {
  await client.query("INSERT INTO iroun_activity(user_id,kind,benefit_id,business_id,data) VALUES($1,$2,$3,$4,$5)", [userId, kind, benefitId, businessId, JSON.stringify(data)]);
}

/** 마감 시각(한국 시간 그날 끝). 마감일이 없으면 NaN. */
export function endTime(b: Pick<Benefit, "endsAt">) {
  if (!b.endsAt) return NaN;
  return /^\d{4}-\d{2}-\d{2}$/.test(b.endsAt) ? Date.parse(`${b.endsAt}T23:59:59.999+09:00`) : Date.parse(b.endsAt);
}
export function daysLeft(b: Pick<Benefit, "endsAt">, now: number) {
  const end = endTime(b);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / DAY)) : null;
}

/**
 * 이 고객에게 안내할 사업장 판정(제6조 ②: 등록 조건에 맞는 사업만 안내).
 * 확인할 점이 남은 '추가 확인 필요'까지 알리면 거의 모든 공고가 알림으로 가므로 '조건 일치'만 안내한다.
 */
export function guidedBusinesses(b: Benefit, profile: Profile, now: number) {
  return matchBenefit(b, profile, new Date(now)).filter((m) => m.result === "조건 일치");
}

export async function activeContractCustomers(client: Query = pool, onlyUser?: string) {
  return (await client.query(
    `SELECT a.id,a.profile,a.preferences FROM iroun_accounts a
     WHERE a.deleted_at IS NULL AND ($1::text IS NULL OR a.id=$1)
     AND EXISTS(SELECT 1 FROM iroun_contracts c WHERE c.user_id=a.id AND c.revoked_at IS NULL AND c.starts_at<=now() AND c.ends_at>now())
     AND NOT EXISTS(SELECT 1 FROM iroun_deletions d WHERE d.user_id=a.id AND d.status<>'삭제 완료')
     AND coalesce((SELECT accepted FROM iroun_consents s WHERE s.user_id=a.id AND s.kind='service' ORDER BY s.id DESC LIMIT 1),true)`,
    [onlyUser ?? null],
  )).rows as { id: string; profile: Profile; preferences: { privacyConsent?: boolean } }[];
}

/**
 * 계약 고객에게 앱 알림함 알림을 만들고 기록한다. 같은 알림은 한 번만 만든다.
 * 휴대폰 푸시는 따로(기존 푸시 설정이 켜졌을 때만) 보낸다.
 */
export async function runContractNotices(options: { now?: number; onlyUser?: string; notices?: () => Promise<Benefit[]> } = {}) {
  const now = options.now ?? Date.now();
  const customers = await activeContractCustomers(pool, options.onlyUser);
  if (!customers.length) return { customers: 0, created: 0 };
  const all = options.notices
    ? await options.notices()
    : (await pool.query("SELECT data FROM iroun_benefits WHERE data->>'reviewStatus'='공개' AND data->>'isTest'='false'")).rows.map((r) => r.data as Benefit);
  const open = all.filter((b) => publicBenefit(b) && !isWelfare(b) && !finished(b, now));
  let created = 0;
  for (const a of customers) {
    if (!a.preferences?.privacyConsent) continue;
    const rows = (await pool.query("SELECT benefit_id,kind,created_at FROM iroun_inbox WHERE user_id=$1", [a.id])).rows;
    const sent = new Set(rows.map((r) => `${r.benefit_id}|${r.kind}`));
    // 처음 안내한 시각. 처음 안내가 이미 마감 7일(3일) 안이었다면 그 알림은 따로 보내지 않는다.
    const firstAt = new Map(rows.filter((r) => r.kind === ALERT.new).map((r) => [r.benefit_id as string, new Date(r.created_at).getTime()]));
    const chosen = new Set((await pool.query("SELECT benefit_id,business_id FROM iroun_choices WHERE user_id=$1", [a.id])).rows.map((r) => `${r.benefit_id}|${r.business_id}`));
    for (const b of open) {
      const ms = guidedBusinesses(b, a.profile, now);
      if (!ms.length) continue;
      const left = daysLeft(b, now);
      const end = endTime(b);
      const send = async (kind: string, extra: Record<string, unknown> = {}) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await c.query("INSERT INTO iroun_inbox(id,user_id,benefit_id,version_hash,kind,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,benefit_id,version_hash) DO NOTHING RETURNING id", [randomUUID(), a.id, b.id, `contract:${kind}`, kind, new Date(now)]);
          if (r.rowCount) {
            const base = { title: b.title, selection: selectionType(b), endsAt: b.endsAt, daysLeft: left };
            if (kind === ALERT.new) {
              // 제6조 ⑦: 마감까지 7일이 남지 않았을 때 처음 안내한 사업은 제15조를 적용하지 않는다.
              await logActivity(a.id, ACTIVITY.notice, b.id, { ...base, maxAmount: b.maxAmount ?? null, documents: b.documents, results: ms.map((m) => ({ businessId: m.businessId, result: m.result })), under7Days: left !== null && left < 7, ...extra }, "", c);
            }
            await logActivity(a.id, ACTIVITY.alert, b.id, { ...base, alert: kind, channel: "앱 알림함" }, "", c);
            created++;
          }
          sent.add(`${b.id}|${kind}`);
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
      };
      if (!sent.has(`${b.id}|${ALERT.new}`)) { await send(ALERT.new); continue; }
      if (!Number.isFinite(end) || end <= now) continue;
      const first = firstAt.get(b.id) ?? 0;
      const unchosen = ms.some((m) => !chosen.has(`${b.id}|${m.businessId}`));
      if (end - now <= 7 * DAY && first < end - 7 * DAY && !sent.has(`${b.id}|${ALERT.d7}`)) { await send(ALERT.d7); continue; }
      if (unchosen && end - now <= REMIND_DAYS * DAY && first < end - REMIND_DAYS * DAY && !sent.has(`${b.id}|${ALERT.remind}`)) await send(ALERT.remind);
    }
  }
  if (created) logger.info({ created }, "계약 고객 맞춤 알림");
  return { customers: customers.length, created };
}
