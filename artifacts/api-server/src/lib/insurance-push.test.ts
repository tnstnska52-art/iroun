import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ contract: false, benefit: {} as any, token: "", sent: 0 }));
vi.mock("@workspace/db", () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM iroun_tracking t") || sql.includes("CROSS JOIN iroun_benefits")) return { rows: [{ user_id: "test", benefit_id: state.benefit.id, benefit: state.benefit, revision: new Date() }] };
    if (sql.includes("FROM iroun_accounts WHERE")) return { rows: [{ id: "test", preferences: { notifications: true, personalizedAlerts: true, privacyConsent: true }, profile: { personal: {}, businesses: [{ id: "business" }] } }] };
    if (sql.includes("AS trial_active")) return { rows: [{ trial_active: true, contract_active: state.contract }] };
    if (sql.includes("FROM iroun_consents")) return { rows: [{ accepted: true }] };
    if (sql.includes("FROM iroun_benefits WHERE")) return { rows: [{ data: state.benefit }] };
    if (sql.includes("FROM iroun_tracking WHERE")) return { rows: [{ data: { deadlineReminder: true } }] };
    if (sql.includes("FROM iroun_push_devices")) return { rows: [{ token_hash: "test", encrypted_token: state.token }] };
    if (sql.includes("INSERT INTO iroun_push_jobs")) return { rowCount: 1, rows: [{ id: "test-job" }] };
    return { rowCount: 0, rows: [] };
  });
  return { pool: { query, connect: async () => ({ query, release: vi.fn() }) } };
});
import { deliverDeadlines, encryptToken, type PushTransport } from "./push-delivery";

const transport: PushTransport = { send: async messages => { state.sent += messages.length; return messages.map(() => ({ status: "ok", id: "test-ticket" })); } };
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-secret");
  state.contract = false;
  state.sent = 0;
  state.token = encryptToken("ExpoPushToken[test-only]");
  state.benefit = { id: "standing-self-employed-insurance", title: "소상공인 고용보험료 지원", audience: "사업", kind: "지원금", category: "경영", summary: "지원", support: "지원", sourceUrl: "https://www.sbiz24.kr/", checkedAt: "2026-01-01T00:00:00Z", endsAt: new Date(Date.now() + 86400000).toISOString(), status: "접수 중", budgetStatus: "해당 없음", reviewStatus: "공개", isTest: false, rules: [], checks: [], region: "전국" };
});
afterEach(() => vi.unstubAllEnvs());
describe("푸시 발송 직전 계약 재확인", () => {
  it.each(["deadline", "personalized"] as const)("%s 알림은 계약 고객에게만 전달", async kind => {
    expect((await deliverDeadlines(transport, "test", Date.now(), kind)).accepted).toBe(0);
    expect(state.sent).toBe(0);
    state.contract = true;
    expect((await deliverDeadlines(transport, "test", Date.now(), kind)).accepted).toBe(1);
    state.contract = false;
    expect((await deliverDeadlines(transport, "test", Date.now(), kind)).accepted).toBe(0);
    expect(state.sent).toBe(1);
  });
  it("다른 지원사업은 기존 체험 이용권 알림을 유지", async () => {
    state.benefit = { ...state.benefit, id: "ordinary", title: "소상공인 경영안정 바우처" };
    expect((await deliverDeadlines(transport, "test")).accepted).toBe(1);
  });
});
