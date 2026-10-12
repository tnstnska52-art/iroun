/**
 * 서류함: 고객이 지원사업에 필요한 서류를 올려 두면 회사가 확인한다.
 * 같은 이름의 서류는 한 번만 올리면 다른 공고에서도 그대로 쓰인다.
 * 회사 신청 도움은 그 공고의 서류를 모두 올린 고객만 요청할 수 있다(company.ts 에서 확인).
 */
import express, { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { account, audit } from "../lib/benefit-store";

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"];
/** 서류 이름 비교: 띄어쓰기와 기호 차이는 무시한다. */
export const docKey = (s: string) => s.normalize("NFKC").replace(/[\s·,()\-_/]/g, "").toLowerCase();

let ready: Promise<unknown> | undefined;
export const ensureDocuments = () => (ready ??= pool.query(readFileSync(new URL("../migrations/005-documents.sql", import.meta.url), "utf8")));
/** 이 공고의 서류 중 고객이 아직 올리지 않은 것 */
export async function missingDocuments(userId: string, documents: string[], client: Pick<typeof pool, "query"> = pool) {
  if (!documents.length) return [];
  await ensureDocuments();
  const have = new Set((await client.query("SELECT name FROM iroun_documents WHERE user_id=$1", [userId])).rows.map((r) => docKey(r.name as string)));
  return documents.filter((d) => !have.has(docKey(d)));
}

const me = (req: Request) => { const id = getAuth(req).userId; if (!id) throw fail("로그인 후 이용해 주세요.", 401); return id; };
async function staff(req: Request) {
  const a = await account(me(req));
  if (a.role !== "admin" && !(a.role === "staff" && (await pool.query("SELECT 1 FROM iroun_staff WHERE user_id=$1 AND enabled=true", [a.id])).rowCount)) throw fail("회사 담당자만 이용할 수 있습니다.", 403);
  return a;
}
/** 직원은 배정된 고객의 서류만, 관리자는 모든 고객의 서류를 본다. */
async function canSee(a: { id: string; role: string }, userId: string) {
  if (a.role === "admin") return true;
  return !!(await pool.query("SELECT 1 FROM iroun_service_requests WHERE user_id=$1 AND assigned_to=$2", [userId, a.id])).rowCount;
}
const meta = "id,name,filename,mime,size,created_at";

export const documentsRouter = Router();
documentsRouter.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
documentsRouter.get("/service/documents", async (req, res) => {
  const id = me(req); await account(id); await ensureDocuments();
  res.json({ documents: (await pool.query(`SELECT ${meta} FROM iroun_documents WHERE user_id=$1 ORDER BY created_at DESC`, [id])).rows });
});
documentsRouter.put("/service/documents/:name", express.raw({ type: () => true, limit: DOC_MAX_BYTES + 1024 }), async (req, res) => {
  const id = me(req); const a = await account(id); await ensureDocuments();
  if (!a.entitlement.contractActive) throw fail("서류 등록은 계약 고객만 할 수 있습니다.", 403);
  const name = String(req.params.name).trim();
  if (!name || name.length > 200) throw fail("서류 이름을 확인해 주세요.");
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (!TYPES.includes(mime)) throw fail("PDF나 사진(JPG, PNG) 파일만 올릴 수 있어요.", 415);
  const data = req.body as Buffer;
  if (!Buffer.isBuffer(data) || data.length === 0) throw fail("파일이 비어 있어요.");
  if (data.length > DOC_MAX_BYTES) throw fail("파일이 너무 커요. 10MB 이하로 올려 주세요.", 413);
  // 파일 앞부분으로 실제 형식을 확인한다(이름만 바꾼 파일 차단).
  const head = data.subarray(0, 12);
  const real = head.subarray(0, 4).toString("latin1") === "%PDF" ? "application/pdf" : head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg"
    : head.subarray(1, 4).toString("latin1") === "PNG" ? "image/png" : head.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp"
    : head.subarray(4, 8).toString("latin1") === "ftyp" ? "image/heic" : "";
  if (real !== mime) throw fail("파일 형식을 확인해 주세요. PDF나 사진만 올릴 수 있어요.", 415);
  let filename = name;
  try { filename = decodeURIComponent(String(req.headers["x-filename"] ?? "")).replace(/[\\/\u0000-\u001f]/g, "").slice(0, 200) || name; } catch { /* 이름을 못 읽으면 서류 이름을 쓴다 */ }
  const count = (await pool.query("SELECT count(*)::int AS n FROM iroun_documents WHERE user_id=$1 AND name<>$2", [id, name])).rows[0].n as number;
  if (count >= 60) throw fail("서류함이 가득 찼어요. 안 쓰는 서류를 지워 주세요.", 409);
  const row = (await pool.query(
    `INSERT INTO iroun_documents(id,user_id,name,filename,mime,size,data) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(user_id,name) DO UPDATE SET filename=excluded.filename,mime=excluded.mime,size=excluded.size,data=excluded.data,created_at=now() RETURNING ${meta}`,
    [randomUUID(), id, name, filename, mime, data.length, data])).rows[0];
  res.json(row);
});
documentsRouter.delete("/service/documents/:id", async (req, res) => {
  const id = me(req); await ensureDocuments();
  const r = await pool.query("DELETE FROM iroun_documents WHERE id=$1 AND user_id=$2", [String(req.params.id), id]);
  if (!r.rowCount) throw fail("서류를 찾을 수 없습니다.", 404);
  res.json({ message: "지웠어요." });
});
documentsRouter.get("/service/documents/:id/file", async (req, res) => {
  const id = me(req); await ensureDocuments();
  const d = (await pool.query("SELECT filename,mime,data FROM iroun_documents WHERE id=$1 AND user_id=$2", [String(req.params.id), id])).rows[0];
  if (!d) throw fail("서류를 찾을 수 없습니다.", 404);
  res.set("Content-Type", d.mime).set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.filename)}`).set("X-Content-Type-Options", "nosniff").send(d.data);
});
documentsRouter.get("/office/customers/:userId/documents", async (req, res) => {
  const a = await staff(req); await ensureDocuments(); const userId = String(req.params.userId);
  if (!(await canSee(a, userId))) throw fail("배정된 고객의 서류만 볼 수 있습니다.", 403);
  res.json({ documents: (await pool.query(`SELECT ${meta} FROM iroun_documents WHERE user_id=$1 ORDER BY created_at DESC`, [userId])).rows });
});
documentsRouter.get("/office/documents/:id/file", async (req, res) => {
  const a = await staff(req); await ensureDocuments();
  const d = (await pool.query("SELECT user_id,name,filename,mime,data FROM iroun_documents WHERE id=$1", [String(req.params.id)])).rows[0];
  if (!d || !(await canSee(a, d.user_id))) throw fail("서류를 찾을 수 없습니다.", 404);
  await audit(a.id, "document.view", String(req.params.id), { userId: d.user_id, name: d.name });
  res.set("Content-Type", d.mime).set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.filename)}`).set("X-Content-Type-Options", "nosniff").send(d.data);
});
documentsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const e = err as { status?: number; statusCode?: number; type?: string; message?: string };
  if (e.type === "entity.too.large") { res.status(413).json({ message: "파일이 너무 커요. 10MB 이하로 올려 주세요." }); return; }
  if (!e.status) return next(err);
  res.status(e.status).json({ message: e.message });
});
