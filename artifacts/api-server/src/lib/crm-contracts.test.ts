import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
vi.mock("@clerk/express", () => ({ clerkClient: { users: {} } }));
import { applyCrmEvent, claimPendingCrm, crmClient, ensureCrmTables, normalizePhone, syncCrmOnce } from "./crm-contracts";
import { account } from "./benefit-store";

// 모두 가짜 고객·가짜 번호.
const tag = randomUUID().slice(0, 8);
const A = `qa-crm-a-${tag}`, B = `qa-crm-b-${tag}`, C = `qa-crm-c-${tag}`, D1 = `qa-crm-d1-${tag}`, D2 = `qa-crm-d2-${tag}`, E = `qa-crm-e-${tag}`;
const n = (i: number) => "0109" + tag.replace(/\D/g, "").padEnd(3, "0").slice(0, 3) + String(i).padStart(4, "0");
const phones: Record<string, string[]> = {};
const findUsers = async (p: string) => phones[p] ?? [];
const day = 86400000;
const iso = (d: number) => new Date(Date.now() + d * day).toISOString();
let seq = 0;
const ev = (contractId: string, version: number, type: "contract.upsert" | "contract.suspended" | "contract.revoked", more: object = {}) => ({
  schemaVersion: 1, eventId: randomUUID(), type, contractId, crmCustomerId: "fixture-" + contractId.slice(0, 6), version,
  status: type === "contract.upsert" ? "active" : type.slice(9), productCode: "benefit_package",
  ...(type === "contract.upsert" ? { startsAt: iso(-1), endsAt: iso(365) } : {}), occurredAt: new Date(Date.now() + seq++).toISOString(), ...more,
});
const active = async (id: string) => (await account(id)).entitlement.contractActive;
const link = async (c: string) => (await pool.query("SELECT * FROM iroun_crm_links WHERE crm_contract_id=$1", [c])).rows[0];
const contracts: string[] = [];
const cid = () => { const c = randomUUID(); contracts.push(c); return c; };

beforeAll(async () => {
  await ensureCrmTables();
  for (const id of [A, B, C, D1, D2, E]) await pool.query("INSERT INTO iroun_accounts(id) VALUES($1) ON CONFLICT DO NOTHING", [id]);
});
afterAll(async () => {
  await pool.query("DELETE FROM iroun_crm_events WHERE crm_contract_id=ANY($1::text[])", [contracts]);
  await pool.query("DELETE FROM iroun_crm_links WHERE crm_contract_id=ANY($1::text[])", [contracts]);
  await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])", [[A, B, C, D1, D2, E]]);
});

describe("전산 패키지 계약 자동 반영", () => {
  it("번호 형식을 맞춘다", () => {
    expect(normalizePhone("+82 10-0000-0001")).toBe("01000000001");
    expect(normalizePhone("p:+821000000001")).toBe("01000000001");
    expect(normalizePhone("1000000001")).toBe("01000000001");
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizePhone("없음")).toBeNull();
  });

  it("가입한 고객: 인증 번호가 하나만 맞으면 바로 계약 고객이 된다", async () => {
    phones[n(1)] = [A];
    const c = cid();
    expect(await active(A)).toBe(false);
    expect(await applyCrmEvent(ev(c, 1, "contract.upsert", { phone: n(1) }), findUsers)).toBe("applied");
    expect(await active(A)).toBe(true);
    expect((await link(c)).state).toBe("linked");
  });

  it("같은 이벤트를 다시 받아도 결과가 같고 두 번 저장하지 않는다", async () => {
    phones[n(2)] = [B];
    const c = cid(), e = ev(c, 1, "contract.upsert", { phone: n(2) });
    expect(await applyCrmEvent(e, findUsers)).toBe("applied");
    expect(await applyCrmEvent(e, findUsers)).toBe("applied");
    expect((await pool.query("SELECT count(*)::int n FROM iroun_contracts WHERE user_id=$1", [B])).rows[0].n).toBe(1);
  });

  it("연장은 같은 계약을 늘리고, 연결 뒤에는 번호가 바뀌어도 다른 계정으로 옮기지 않는다", async () => {
    phones[n(3)] = [C];
    const c = cid();
    await applyCrmEvent(ev(c, 1, "contract.upsert", { phone: n(3), endsAt: iso(30) }), findUsers);
    phones[n(3)] = [E]; // 같은 번호가 이제 다른 사람 계정
    expect(await applyCrmEvent(ev(c, 2, "contract.upsert", { phone: n(3), endsAt: iso(400) }), findUsers)).toBe("applied");
    const rows = (await pool.query("SELECT user_id,ends_at FROM iroun_contracts WHERE id=$1", ["crm:" + c])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(C);
    expect(rows[0].ends_at.getTime()).toBeGreaterThan(Date.now() + 300 * day);
    expect(await active(E)).toBe(false);
  });

  it("취소는 그 계약만 멈추고, 늦게 온 구버전이 취소를 되돌리지 못한다", async () => {
    const c = (await pool.query("SELECT crm_contract_id FROM iroun_crm_links WHERE user_id=$1", [C])).rows[0].crm_contract_id;
    expect(await applyCrmEvent(ev(c, 3, "contract.revoked"), findUsers)).toBe("applied");
    expect(await active(C)).toBe(false);
    expect(await applyCrmEvent(ev(c, 2, "contract.upsert", { phone: n(3) }), findUsers)).toBe("applied");
    expect(await active(C)).toBe(false);
    expect((await link(c)).version).toBe(3);
    // 재등록(새 버전)은 다시 살린다
    await applyCrmEvent(ev(c, 4, "contract.upsert", { phone: n(3) }), findUsers);
    expect(await active(C)).toBe(true);
  });

  it("보류는 체험 등 다른 이용권은 건드리지 않는다", async () => {
    await pool.query("INSERT INTO iroun_trials(user_id,ends_at) VALUES($1,now()+interval '2 days') ON CONFLICT DO NOTHING", [A]);
    const c = (await pool.query("SELECT crm_contract_id FROM iroun_crm_links WHERE user_id=$1", [A])).rows[0].crm_contract_id;
    await applyCrmEvent(ev(c, 2, "contract.suspended"), findUsers);
    const e = (await account(A)).entitlement;
    expect(e.contractActive).toBe(false);
    expect(e.trialActive).toBe(true);
  });

  it("가입 전 계약은 대기했다가, 그 번호로 인증 가입하면 연결된다", async () => {
    const c = cid(), phone = n(5);
    expect(await applyCrmEvent(ev(c, 1, "contract.upsert", { phone }), findUsers)).toBe("pending_signup");
    expect((await link(c)).phone_hash).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.stringify(await link(c))).not.toContain(phone); // 번호 원문은 저장하지 않음
    // 미인증 번호로는 연결 안 됨
    expect(await claimPendingCrm(D1, { verifiedPhone: async () => null, findUsers, now: 1 })).toBe(0);
    phones[phone] = [D1];
    expect(await claimPendingCrm(D1, { verifiedPhone: async () => phone, findUsers, now: 2 })).toBe(1);
    expect(await active(D1)).toBe(true);
    expect((await link(c)).state).toBe("linked");
  });

  it("가입 전에 취소된 계약은 나중에 가입해도 연결하지 않는다", async () => {
    const c = cid(), phone = n(6);
    await applyCrmEvent(ev(c, 1, "contract.upsert", { phone }), findUsers);
    await applyCrmEvent(ev(c, 2, "contract.revoked"), findUsers);
    phones[phone] = [D2];
    expect(await claimPendingCrm(D2, { verifiedPhone: async () => phone, findUsers, now: 3 })).toBe(0);
    expect(await active(D2)).toBe(false);
  });

  it("같은 번호 계정이 여러 개면 자동 연결하지 않고 회사 확인으로", async () => {
    const c = cid(), phone = n(7);
    phones[phone] = [D2, E];
    expect(await applyCrmEvent(ev(c, 1, "contract.upsert", { phone }), findUsers)).toBe("review_required");
    expect(await active(D2)).toBe(false);
    expect(await active(E)).toBe(false);
    expect((await link(c)).review_reason).toBe("같은 번호 계정 여러 개");
  });

  it("기간이 끝나면 별도 이벤트 없이 계약 고객이 아니다", async () => {
    const c = cid(), phone = n(8);
    phones[phone] = [E];
    await applyCrmEvent(ev(c, 1, "contract.upsert", { phone, startsAt: iso(-40), endsAt: iso(-1) }), findUsers);
    expect(await active(E)).toBe(false);
  });

  it("잘못된 이벤트는 저장하지 않는다(확인도 안 보냄)", async () => {
    await expect(applyCrmEvent({ ...ev(cid(), 1, "contract.upsert"), schemaVersion: 2 }, findUsers)).rejects.toThrow();
    await expect(applyCrmEvent(ev(cid(), 1, "contract.upsert", { endsAt: iso(-5) }), findUsers)).rejects.toThrow();
  });
});

describe("전산과 통신", () => {
  const secret = "ab".repeat(32);
  it("서명 규격: timestamp\\nPOST\\npath\\nbody", async () => {
    const calls: any[] = [];
    const fake = (async (url: URL, init: any) => { calls.push({ url: String(url), ...init }); return new Response(JSON.stringify({ events: [], hasMore: false })); }) as any;
    await crmClient({ secret, fetchImpl: fake }).pull(25);
    const [c] = calls;
    expect(c.url).toBe("https://benefit-people-crm.tnstnska52.chatgpt.site/api/integration/contracts/pull");
    expect(c.headers["X-Timestamp"]).toMatch(/^\d{10}$/);
    const want = createHmac("sha256", secret).update(`${c.headers["X-Timestamp"]}\nPOST\n/api/integration/contracts/pull\n${c.body}`, "utf8").digest("hex");
    expect(c.headers["X-Signature"]).toBe(want);
    expect(JSON.parse(c.body)).toMatchObject({ limit: 25, requestId: expect.any(String) });
    expect(() => crmClient({ secret: "short" })).toThrow();
    expect(() => crmClient({ secret, baseUrl: "http://x.example" })).toThrow();
  });

  it("확인 전송이 끊기면 다음에 같은 이벤트를 다시 받아 같은 결과로 확인한다", async () => {
    phones[n(9)] = [E];
    const c = cid(), e = ev(c, 1, "contract.upsert", { phone: n(9) });
    const acks: any[] = [];
    let failAck = true;
    const client = {
      pull: async () => ({ events: [e], hasMore: false }),
      acknowledge: async (eventId: string, status: string) => { if (failAck) throw new Error("network"); acks.push({ eventId, status }); return {}; },
    } as any;
    const apply = (x: unknown) => applyCrmEvent(x, findUsers);
    expect(await syncCrmOnce(client, apply)).toEqual({ acknowledged: 0, failed: 1 });
    expect(await active(E)).toBe(true); // 저장은 됨
    failAck = false;
    expect(await syncCrmOnce(client, apply)).toEqual({ acknowledged: 1, failed: 0 });
    expect(acks).toEqual([{ eventId: e.eventId, status: "applied" }]);
  });

  it("저장에 실패하면 확인을 보내지 않는다", async () => {
    const acks: any[] = [];
    const client = { pull: async () => ({ events: [{ bad: true }], hasMore: false }), acknowledge: async (...a: any[]) => { acks.push(a); return {}; } } as any;
    expect(await syncCrmOnce(client, (x) => applyCrmEvent(x, findUsers))).toEqual({ acknowledged: 0, failed: 1 });
    expect(acks).toHaveLength(0);
  });
});
