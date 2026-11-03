import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

const fixture = vi.hoisted(() => ({ items: [] as any[], access: { active: true, contractActive: false } }));
vi.mock("@clerk/express", () => ({ getAuth: (req: express.Request) => ({ userId: req.headers["x-test-identity"] ?? null }), clerkClient: {} }));
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn(async (sql: string) => ({ rows: sql.includes(" AS active") ? [{ active: true }] : fixture.items.map(data => ({ data })) })) } }));
vi.mock("../lib/benefit-store", () => ({
  account: async () => ({ id: "test", serverNow: new Date().toISOString(), entitlement: fixture.access, preferences: {}, profile: { personal: {}, businesses: [{ id: "business" }] } }),
  audit: vi.fn(), connections: vi.fn(),
}));
import { benefitsRouter } from "./benefits";
import publicLeadsRouter from "./public-leads";
import { createCompanyRouter } from "./company";
import { clearCheckCache } from "../lib/check-benefits";

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.log = { error: () => undefined } as any; next(); });
app.use("/api", publicLeadsRouter, benefitsRouter);
app.use("/api", createCompanyRouter({ notices: async () => fixture.items }));
const base = { audience: "사업", kind: "지원금", region: "전국", category: "경영", agency: "중소벤처기업부", summary: "지원", support: "지원", calculation: "", sourceUrl: "https://www.sbiz24.kr/", checkedAt: "2026-01-01T00:00:00Z", startsAt: "", endsAt: "", status: "상시 조회", budgetStatus: "해당 없음", reviewStatus: "공개", isTest: false, rules: [], checks: [], documents: [] };
const insurance = { ...base, id: "standing-self-employed-insurance", title: "소상공인 고용보험료 지원" };
const normal = { ...base, id: "normal", title: "소상공인 경영안정 바우처" };

beforeEach(() => {
  fixture.items = [insurance, normal];
  fixture.access = { active: true, contractActive: false };
  clearCheckCache();
});

describe("공개·로그인 고객 공고 경로", () => {
  it("일반 홈페이지는 query 플래그로 계약 목록을 열 수 없다", async () => {
    const r = await request(app).get("/api/public/check-benefits?part=all&contract=true");
    expect(r.status).toBe(200);
    expect(r.body.map((b: any) => b.id)).toEqual(["normal"]);
  });
  it("전산 서버 서명은 전체 목록을 받고 다음 공개 조회에는 섞이지 않는다", async () => {
    const path = "/api/public/check-benefits?part=open", timestamp = String(Math.floor(Date.now() / 1000));
    vi.stubEnv("CRM_APP_PROFILE_SECRET", "a".repeat(64));
    try {
      const signature = createHmac("sha256", "a".repeat(64)).update(`${timestamp}\nGET\n${path}\n`).digest("hex");
      const contract = await request(app).get(path).set({ "X-Timestamp": timestamp, "X-Signature": signature });
      expect(contract.status).toBe(200);
      expect(contract.body).toHaveLength(2);
      expect(contract.headers["cache-control"]).toBe("private, no-store");
      const publicList = await request(app).get(path);
      expect(publicList.body.map((b: any) => b.id)).toEqual(["normal"]);
      expect((await request(app).get(path).set("X-Signature", "bad")).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it("비회원·무료/체험 회원은 목록과 직접 상세 모두 제외", async () => {
    for (const headers of [{}, { "x-test-identity": "free" }]) {
      const list = await request(app).get("/api/benefits").set(headers);
      expect(list.status).toBe(200);
      expect(list.body.map((b: any) => b.id)).toEqual(["normal"]);
      expect((await request(app).get(`/api/benefits/${insurance.id}`).set(headers)).status).toBe(404);
      expect((await request(app).get("/api/benefits/normal").set(headers)).status).toBe(200);
    }
  });
  it("유효 계약은 허용하고 회수 뒤 일반 이용권이 남아도 차단", async () => {
    fixture.access.contractActive = true;
    const headers = { "x-test-identity": "contract" };
    const allowed = await request(app).get("/api/benefits").set(headers);
    expect(allowed.body).toHaveLength(2);
    expect(allowed.headers["cache-control"]).toBe("private, no-store");
    expect((await request(app).get(`/api/benefits/${insurance.id}`).set(headers)).status).toBe(200);
    fixture.access.contractActive = false;
    expect((await request(app).get(`/api/benefits/${insurance.id}`).set(headers)).status).toBe(404);
    expect((await request(app).get(`/api/benefits`).set(headers)).body).toHaveLength(1);
  });
  it("동의 철회로 이용권이 비활성이면 계약 잔여일이 있어도 차단", async () => {
    fixture.access = { active: false, contractActive: true };
    expect((await request(app).get(`/api/benefits/${insurance.id}`).set("x-test-identity", "withdrawn")).status).toBe(404);
  });
  it("맞춤 추천과 신청 현황도 같은 계약 기준을 사용", async () => {
    for (const contractActive of [false, true]) {
      fixture.access.contractActive = contractActive;
      const headers = { "x-test-identity": "customer" };
      const recommendations = await request(app).get("/api/recommendations").set(headers);
      expect(recommendations.status).toBe(200);
      expect(recommendations.body.some((row: any) => row.benefitId === insurance.id)).toBe(contractActive);
      const matches = await request(app).get("/api/service/matches").set(headers);
      expect(matches.status).toBe(200);
      expect(matches.body.items.some((row: any) => row.benefit.id === insurance.id)).toBe(contractActive);
    }
  });
});
