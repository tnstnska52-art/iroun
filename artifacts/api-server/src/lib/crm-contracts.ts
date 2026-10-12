// 회사 전산(CRM) → 앱: 패키지 계약 자동 반영.
// 전산이 쌓아 둔 계약 변경을 앱 서버가 60초마다 가져와(pull) DB에 저장한 뒤에만 확인(ack)을 보낸다.
// 서버 전용. 키·고객 번호·본문은 로그에 남기지 않는다.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";
import { migrationSql } from "./migration";

import { logger } from "./logger";

type Query = Pick<typeof pool, "query">;
export type Receipt = "applied" | "pending_signup" | "review_required";

let ready: Promise<unknown> | undefined;
export const ensureCrmTables = () => (ready ??= pool.query(migrationSql("006-crm-contracts.sql")));

/** 010-1234-5678, +82 10-1234-5678, 1012345678 → 01012345678. 휴대폰 번호가 아니면 null. */
export function normalizePhone(raw: string | undefined | null) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  if (/^1[016789]\d{7,8}$/.test(d)) d = "0" + d;
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}
export const phoneHash = (phone: string) => createHash("sha256").update("iroun-crm-phone:" + phone).digest("hex");

const uuid = z.string().min(8).max(100);
const iso = z.string().datetime({ offset: true });
export const crmEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: uuid,
  type: z.enum(["contract.upsert", "contract.suspended", "contract.revoked"]),
  occurredAt: iso.optional(),
  contractId: uuid,
  crmCustomerId: z.string().min(1).max(100),
  version: z.number().int().min(1),
  productCode: z.string().max(60).optional(),
  status: z.enum(["active", "suspended", "revoked"]),
  startsAt: iso.optional(),
  endsAt: iso.optional(),
  phone: z.string().max(40).optional(),
}).passthrough();
export type CrmEvent = z.infer<typeof crmEvent>;

/** 이 번호를 '인증 완료된 대표 번호'로 쓰는 Clerk 사용자 ID 목록. */
export type FindUsers = (phone: string) => Promise<string[]>;
export const clerkUsersByPhone: FindUsers = async (phone) => {
  const e164 = "+82" + phone.slice(1);
  const list = await clerkClient.users.getUserList({ phoneNumber: [e164], limit: 10 });
  const users = (Array.isArray(list) ? list : list.data) as Awaited<ReturnType<typeof clerkClient.users.getUser>>[];
  return users.filter((u) => u.phoneNumbers.some((p) => p.id === u.primaryPhoneNumberId && p.verification?.status === "verified" && normalizePhone(p.phoneNumber) === phone)).map((u) => u.id);
};
/** 로그인한 사용자의 인증 완료 대표 번호. 미인증·없음이면 null. */
export type VerifiedPhone = (userId: string) => Promise<string | null>;
export const clerkVerifiedPhone: VerifiedPhone = async (id) => {
  const u = await clerkClient.users.getUser(id);
  const p = u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId && p.verification?.status === "verified");
  return p ? normalizePhone(p.phoneNumber) : null;
};

async function tx<T>(work: (c: Query) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await work(c); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
async function usable(c: Query, userId: string) {
  await c.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
  const { rows: [a] } = await c.query("SELECT deleted_at FROM iroun_accounts WHERE id=$1 FOR UPDATE", [userId]);
  if (!a || a.deleted_at) return false;
  return !(await c.query("SELECT 1 FROM iroun_deletions WHERE user_id=$1 AND status<>'삭제 완료'", [userId])).rowCount;
}
/** 연결된 앱 계정에 계약 기간을 반영한다. 같은 전산 계약은 항상 같은 앱 계약 한 건. */
async function grant(c: Query, link: { crm_contract_id: string; app_contract_id: string | null }, userId: string, startsAt: string, endsAt: string) {
  const id = link.app_contract_id ?? "crm:" + link.crm_contract_id;
  await c.query(`INSERT INTO iroun_contracts(id,user_id,starts_at,ends_at,reason,evidence,actor) VALUES($1,$2,$3,$4,'회사 패키지 계약 이용권',$5,'crm')
    ON CONFLICT(id) DO UPDATE SET starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, revoked_at=NULL WHERE iroun_contracts.user_id=EXCLUDED.user_id`,
    [id, userId, startsAt, endsAt, "crm-contract:" + link.crm_contract_id]);
  return id;
}

/**
 * 이벤트 한 건을 한 트랜잭션으로 저장한다. 같은 eventId는 처음 결과를 그대로 돌려준다.
 * 이미 더 높은 버전을 받았으면 지금 상태를 유지하고 applied.
 */
export async function applyCrmEvent(input: unknown, findUsers: FindUsers = clerkUsersByPhone): Promise<Receipt> {
  const ev = crmEvent.parse(input);
  if (ev.type === "contract.upsert" && (ev.status !== "active" || !ev.startsAt || !ev.endsAt || Date.parse(ev.endsAt) <= Date.parse(ev.startsAt))) throw new Error("잘못된 계약 기간");
  if (ev.type !== "contract.upsert" && ev.status !== ev.type.slice(9)) throw new Error("상태 불일치");
  await ensureCrmTables();
  // Clerk 조회는 트랜잭션 밖에서 미리(잠금을 오래 잡지 않도록).
  const phone = ev.type === "contract.upsert" ? normalizePhone(ev.phone) : null;
  let candidates: string[] | undefined;
  if (phone) {
    const pre = (await pool.query("SELECT user_id FROM iroun_crm_links WHERE crm_contract_id=$1", [ev.contractId])).rows[0];
    if (!pre?.user_id) candidates = await findUsers(phone); // 조회 실패면 확인을 보내지 않고 다음에 다시 받는다
  }
  return tx(async (c) => {
    const seen = (await c.query("SELECT receipt FROM iroun_crm_events WHERE event_id=$1", [ev.eventId])).rows[0];
    if (seen) return seen.receipt as Receipt;
    await c.query("INSERT INTO iroun_crm_links(crm_contract_id,crm_customer_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [ev.contractId, ev.crmCustomerId]);
    const { rows: [link] } = await c.query("SELECT * FROM iroun_crm_links WHERE crm_contract_id=$1 FOR UPDATE", [ev.contractId]);
    const record = async (receipt: Receipt) => {
      await c.query("INSERT INTO iroun_crm_events(event_id,crm_contract_id,version,type,receipt) VALUES($1,$2,$3,$4,$5)", [ev.eventId, ev.contractId, ev.version, ev.type, receipt]);
      return receipt;
    };
    if (link.version >= ev.version) return record("applied"); // 늦게 온 구버전: 최신 상태 유지

    if (ev.type !== "contract.upsert") {
      if (link.app_contract_id) await c.query("UPDATE iroun_contracts SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL", [link.app_contract_id]);
      await c.query("UPDATE iroun_crm_links SET version=$2,status=$3,state=CASE WHEN user_id IS NULL THEN 'stopped' ELSE state END,updated_at=now() WHERE crm_contract_id=$1", [ev.contractId, ev.version, ev.status]);
      return record("applied");
    }
    const save = (state: string, extra: { user_id?: string | null; app_contract_id?: string | null; review_reason?: string | null; phone_hash?: string | null } = {}) =>
      c.query(`UPDATE iroun_crm_links SET version=$2,status='active',state=$3,starts_at=$4,ends_at=$5,crm_customer_id=$6,
        user_id=coalesce($7,user_id),app_contract_id=coalesce($8,app_contract_id),review_reason=$9,phone_hash=coalesce($10,phone_hash),updated_at=now() WHERE crm_contract_id=$1`,
        [ev.contractId, ev.version, state, ev.startsAt, ev.endsAt, ev.crmCustomerId, extra.user_id ?? null, extra.app_contract_id ?? null, extra.review_reason ?? null, extra.phone_hash ?? null]);

    // 이미 연결된 계약: 번호로 다시 찾지 않고 그 계정에만 반영(연장·재등록).
    if (link.user_id) {
      if (!(await usable(c, link.user_id))) { await save("review_required", { review_reason: "연결된 계정 삭제" }); return record("review_required"); }
      const id = await grant(c, link, link.user_id, ev.startsAt!, ev.endsAt!);
      await save("linked", { app_contract_id: id });
      return record("applied");
    }
    if (!phone) { await save("review_required", { review_reason: "휴대폰 번호 확인 필요" }); return record("review_required"); }
    candidates ??= await findUsers(phone);
    if (candidates.length === 0) { await save("pending_signup", { phone_hash: phoneHash(phone) }); return record("pending_signup"); }
    if (candidates.length > 1) { await save("review_required", { review_reason: "같은 번호 계정 여러 개", phone_hash: phoneHash(phone) }); return record("review_required"); }
    const userId = candidates[0]!;
    if (!(await usable(c, userId))) { await save("review_required", { review_reason: "계정 삭제 처리 중", phone_hash: phoneHash(phone) }); return record("review_required"); }
    const id = await grant(c, link, userId, ev.startsAt!, ev.endsAt!);
    await save("linked", { user_id: userId, app_contract_id: id, phone_hash: phoneHash(phone) });
    return record("applied");
  });
}

/**
 * 가입 전에 받아 둔 계약을, 인증된 번호로 가입한 고객에게 연결한다. /me 호출 때 실행.
 * 같은 번호의 계정이 여러 개면 연결하지 않고 검토로 돌린다.
 */
const lastTry = new Map<string, number>();
export async function claimPendingCrm(userId: string, opts: { verifiedPhone?: VerifiedPhone; findUsers?: FindUsers; now?: number } = {}) {
  await ensureCrmTables();
  if (!(await pool.query("SELECT 1 FROM iroun_crm_links WHERE state='pending_signup' LIMIT 1")).rowCount) return 0;
  const now = opts.now ?? Date.now();
  if (!opts.now && now - (lastTry.get(userId) ?? 0) < 60000) return 0;
  lastTry.set(userId, now);
  let phone: string | null;
  try { phone = await (opts.verifiedPhone ?? clerkVerifiedPhone)(userId); } catch { return 0; }
  if (!phone) return 0;
  const hash = phoneHash(phone);
  if (!(await pool.query("SELECT 1 FROM iroun_crm_links WHERE state='pending_signup' AND phone_hash=$1 LIMIT 1", [hash])).rowCount) return 0;
  const owners = await (opts.findUsers ?? clerkUsersByPhone)(phone).catch(() => null);
  if (!owners) return 0;
  return tx(async (c) => {
    const { rows } = await c.query("SELECT * FROM iroun_crm_links WHERE state='pending_signup' AND phone_hash=$1 FOR UPDATE", [hash]);
    if (!rows.length) return 0;
    if (owners.length !== 1 || owners[0] !== userId) {
      await c.query("UPDATE iroun_crm_links SET state='review_required',review_reason='같은 번호 계정 여러 개',updated_at=now() WHERE crm_contract_id=ANY($1::text[])", [rows.map((r) => r.crm_contract_id)]);
      return 0;
    }
    if (!(await usable(c, userId))) return 0;
    for (const link of rows) {
      const id = await grant(c, link, userId, link.starts_at.toISOString(), link.ends_at.toISOString());
      await c.query("UPDATE iroun_crm_links SET user_id=$2,app_contract_id=$3,state='linked',updated_at=now() WHERE crm_contract_id=$1", [link.crm_contract_id, userId, id]);
    }
    return rows.length;
  });
}

// ── 전산과 통신(서버 간 HMAC) ──
export function crmClient({ baseUrl = process.env.CRM_BASE_URL, secret = process.env.CRM_APP_INBOUND_SECRET, fetchImpl = fetch }: { baseUrl?: string; secret?: string; fetchImpl?: typeof fetch } = {}) {
  const base = new URL(baseUrl || "https://benefit-people-crm.tnstnska52.chatgpt.site");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("CRM_BASE_URL must be an HTTPS origin");
  if (!secret || !/^[a-f\d]{64}$/i.test(secret)) throw new Error("CRM_APP_INBOUND_SECRET not configured");
  async function request(path: string, input: object) {
    const raw = JSON.stringify({ requestId: randomUUID(), ...input }), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret!).update(`${timestamp}\nPOST\n${path}\n${raw}`, "utf8").digest("hex");
    const res = await fetchImpl(new URL(path, base), { method: "POST", headers: { "Content-Type": "application/json", "X-Timestamp": timestamp, "X-Signature": signature }, body: raw, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!res.ok) throw Object.assign(new Error(`CRM HTTP ${res.status}`), { status: res.status });
    return res.json() as Promise<any>;
  }
  return {
    pull: (limit = 25) => request("/api/integration/contracts/pull", { limit }),
    acknowledge: (eventId: string, status: Receipt) => request("/api/integration/contracts/ack", { eventId, status }),
  };
}
export type CrmClient = ReturnType<typeof crmClient>;

/** 한 번 가져와서 저장·확인. 저장에 실패한 이벤트는 확인을 보내지 않는다(다음에 다시 받음). */
export async function syncCrmOnce(client: CrmClient, apply: (e: unknown) => Promise<Receipt> = (e) => applyCrmEvent(e)) {
  let acknowledged = 0, failed = 0, pages = 0, more = true;
  while (more && pages < 8) {
    const batch = await client.pull(25);
    if (!Array.isArray(batch?.events)) throw new Error("Invalid CRM feed response");
    for (const event of batch.events) {
      try { const status = await apply(event); await client.acknowledge(event.eventId, status); acknowledged++; }
      catch { failed++; }
    }
    pages++;
    more = batch.hasMore === true && failed === 0;
  }
  return { acknowledged, failed };
}

export function crmSyncReady() {
  return process.env.IROUN_CRM_SYNC_ENABLED !== "false" && /^[a-f\d]{64}$/i.test(process.env.CRM_APP_INBOUND_SECRET ?? "");
}
export function startCrmSync(intervalMs = 60000) {
  const client = crmClient();
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      const r = await syncCrmOnce(client);
      if (r.acknowledged || r.failed) logger.info({ acknowledged: r.acknowledged, failed: r.failed }, "전산 계약 수신");
    } catch (e: any) {
      const s = e?.status ?? 0;
      logger.warn({ httpStatus: s }, s === 401 || s === 403 || s === 503 ? "전산 계약 수신: 공동 키·설정 확인 필요" : "전산 계약 수신 실패: 다음 주기에 재시도");
    } finally { running = false; }
  };
  void tick();
  const t = setInterval(() => void tick(), intervalMs); t.unref();
  return () => clearInterval(t);
}
