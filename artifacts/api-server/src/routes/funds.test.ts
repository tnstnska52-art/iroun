import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
vi.mock("@clerk/express", () => ({ getAuth: (r: any) => ({ userId: r.get("x-test-user") || null }), clerkClient: { users: {} } }));
import { fundsRouter } from "./funds";

const tag = randomUUID().slice(0, 8), admin = `qa-fund-admin-${tag}`, user = `qa-fund-user-${tag}`;
const phone = `010-${String(Math.floor(1000 + Math.random() * 8999))}-${String(Math.floor(1000 + Math.random() * 8999))}`;
const app = () => { const a = express(); a.use(express.json()); a.use(fundsRouter); return a; };
const lead = (extra: any = {}) => ({ requestKey: randomUUID(), consent: true, entity: "개인", openedYear: 2020, openedMonth: 3, industry: "음식점", province: "경기도", district: "수원시",
  revenue: [{ year: 2025, band: "1억~3억" }, { year: 2024, band: "1억~3억" }, { year: 2023, band: "5천만~1억" }], creditKcb: "700~799", creditNice: "모름",
  loans: [{ lender: "은행", amount: "1천만~3천만" }], issues: [], premises: "임차", premisesValue: "1천만~3천만", home: "자가", homeValue: "3억~5억",
  businessName: `시험상호 ${tag}`, name: "시험", phone, ...extra });

afterAll(async () => {
  await pool.query("DELETE FROM iroun_fund_leads WHERE business_name=$1", [`시험상호 ${tag}`]);
  await pool.query("DELETE FROM iroun_audit WHERE actor=$1", [admin]);
  await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])", [[admin, user]]);
});

describe("정책자금 진단 요청", () => {
  it("동의 없거나 번호가 틀리면 받지 않는다", async () => {
    expect((await request(app()).post("/fund/diagnosis").send(lead({ consent: false }))).status).toBe(400);
    expect((await request(app()).post("/fund/diagnosis").send(lead({ phone: "02-123-4567" }))).status).toBe(400);
    expect((await request(app()).post("/fund/diagnosis").send({ ...lead(), extra: 1 })).status).toBe(400);
  });
  it("비회원도 접수되고 같은 요청은 한 번만 저장된다", async () => {
    const body = lead();
    const a = await request(app()).post("/fund/diagnosis").send(body);
    const b = await request(app()).post("/fund/diagnosis").send(body);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body.id).toBe(a.body.id);
    const rows = (await pool.query("SELECT phone,answers,consent_at FROM iroun_fund_leads WHERE id=$1", [a.body.id])).rows;
    expect(rows[0].phone).toBe(phone.replace(/\D/g, ""));
    expect(rows[0].answers.creditKcb).toBe("700~799");
    expect(rows[0].consent_at).toBeTruthy();
  });
  it("같은 번호는 하루 3번까지만", async () => {
    await request(app()).post("/fund/diagnosis").send(lead());
    await request(app()).post("/fund/diagnosis").send(lead());
    expect((await request(app()).post("/fund/diagnosis").send(lead())).status).toBe(429);
  });
  it("목록은 관리자·직원만 본다", async () => {
    expect((await request(app()).get("/office/fund-leads")).status).toBe(401);
    expect((await request(app()).get("/office/fund-leads").set("x-test-user", user)).status).toBe(403);
    await request(app()).get("/office/fund-leads").set("x-test-user", admin);
    await pool.query("UPDATE iroun_accounts SET role='admin' WHERE id=$1", [admin]);
    const list = await request(app()).get("/office/fund-leads").set("x-test-user", admin);
    expect(list.status).toBe(200);
    const mine = list.body.leads.filter((l: any) => l.business_name === `시험상호 ${tag}`);
    expect(mine.length).toBe(3);
    const done = await request(app()).post(`/office/fund-leads/${mine[0].id}`).set("x-test-user", admin).send({ state: "안내 완료", memo: "통화함" });
    expect(done.status).toBe(200);
  });
});
