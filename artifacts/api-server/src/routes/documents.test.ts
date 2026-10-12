import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
vi.mock("@clerk/express", () => ({ getAuth: (r: any) => ({ userId: r.get("x-test-user") || null }), clerkClient: { users: {} } }));
import { documentsRouter, ensureDocuments, missingDocuments } from "./documents";

const tag = randomUUID().slice(0, 8), owner = `qa-doc-owner-${tag}`, other = `qa-doc-other-${tag}`, admin = `qa-doc-admin-${tag}`, trial = `qa-doc-trial-${tag}`;
const app = () => { const a = express(); a.use(express.json({ limit: "256kb" })); a.use(documentsRouter); return a; };
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 1)]);
const put = (user: string, name: string, body: Buffer, type = "application/pdf") => request(app()).put(`/service/documents/${encodeURIComponent(name)}`).set("x-test-user", user).set("Content-Type", type).set("X-Filename", encodeURIComponent("사업자 등록증.pdf")).send(body);

beforeAll(async () => {
  await ensureDocuments();
  for (const [id, role] of [[owner, "customer"], [other, "customer"], [admin, "admin"], [trial, "customer"]]) await pool.query("INSERT INTO iroun_accounts(id,role) VALUES($1,$2)", [id, role]);
  for (const id of [owner, other]) await pool.query("INSERT INTO iroun_contracts(id,user_id,starts_at,ends_at,reason,evidence,actor) VALUES($1,$2,now()-interval '1 day',now()+interval '30 days','시험','시험',$3)", [randomUUID(), id, admin]);
});
afterAll(async () => {
  await pool.query("DELETE FROM iroun_audit WHERE actor=$1", [admin]);
  await pool.query("DELETE FROM iroun_accounts WHERE id=ANY($1::text[])", [[owner, other, admin, trial]]);
});

describe("서류함", () => {
  it("로그인과 계약이 있어야 올릴 수 있다", async () => {
    expect((await request(app()).put("/service/documents/x").set("Content-Type", "application/pdf").send(pdf)).status).toBe(401);
    expect((await put(trial, "사업자등록증명", pdf)).status).toBe(403);
  });
  it("PDF·사진만 받고, 이름만 바꾼 파일은 거절한다", async () => {
    expect((await put(owner, "사업자등록증명", Buffer.from("MZ exe"), "application/pdf")).status).toBe(415);
    expect((await put(owner, "사업자등록증명", Buffer.from("hello"), "text/plain")).status).toBe(415);
    expect((await put(owner, "사업자등록증명", Buffer.alloc(10 * 1024 * 1024 + 2000, 1))).status).toBe(413);
  });
  it("올린 서류는 목록에 나오고, 같은 이름으로 다시 올리면 바뀐다", async () => {
    const a = await put(owner, "사업자등록증명", pdf);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ name: "사업자등록증명", filename: "사업자 등록증.pdf", mime: "application/pdf", size: pdf.length });
    await put(owner, "사업자등록증명", Buffer.concat([pdf, Buffer.alloc(5, 2)]));
    const list = (await request(app()).get("/service/documents").set("x-test-user", owner)).body.documents;
    expect(list).toHaveLength(1);
    expect(list[0].size).toBe(pdf.length + 5);
    expect(list[0].data).toBeUndefined();
  });
  it("띄어쓰기가 달라도 같은 서류로 본다. 없는 서류만 알려준다", async () => {
    expect(await missingDocuments(owner, ["사업자 등록증명", "소상공인확인서"])).toEqual(["소상공인확인서"]);
    expect(await missingDocuments(owner, [])).toEqual([]);
  });
  it("남의 서류는 보거나 지울 수 없고, 관리자는 볼 수 있으며 열람이 기록된다", async () => {
    const id = (await request(app()).get("/service/documents").set("x-test-user", owner)).body.documents[0].id;
    expect((await request(app()).get(`/service/documents/${id}/file`).set("x-test-user", other)).status).toBe(404);
    expect((await request(app()).delete(`/service/documents/${id}`).set("x-test-user", other)).status).toBe(404);
    expect((await request(app()).get(`/office/documents/${id}/file`).set("x-test-user", other)).status).toBe(403);
    const mine = await request(app()).get(`/service/documents/${id}/file`).set("x-test-user", owner).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on("data", (d) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    expect(mine.status).toBe(200);
    expect((mine.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect((await request(app()).get(`/office/customers/${owner}/documents`).set("x-test-user", admin)).body.documents).toHaveLength(1);
    expect((await request(app()).get(`/office/documents/${id}/file`).set("x-test-user", admin)).status).toBe(200);
    expect((await pool.query("SELECT 1 FROM iroun_audit WHERE actor=$1 AND action='document.view'", [admin])).rowCount).toBe(1);
    expect((await request(app()).delete(`/service/documents/${id}`).set("x-test-user", owner)).status).toBe(200);
    expect(await missingDocuments(owner, ["사업자등록증명"])).toEqual(["사업자등록증명"]);
  });
});
