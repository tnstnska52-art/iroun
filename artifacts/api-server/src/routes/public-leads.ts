import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { checkLeadInput, checkLeadStatus, enqueueCheckLead } from "../lib/check-leads";
import { checkList, type CheckPart } from "../lib/check-benefits";
import { publicBenefit, type Benefit } from "../lib/benefit-domain";

// 홈페이지 지원금 무료 조회에서 고객이 '무료로 전체 보기'를 누르면 받는 창구. 로그인 없이 받으므로
// 우리 홈페이지 주소에서 온 요청만, IP 당 10분에 10번까지만(가입 1번 + 도움 요청 여러 번) 받는다. 받은 내용은 전산으로만 넘긴다.
const router: IRouter = Router();
const ORIGINS = new Set(["https://www.irowoon.com", "https://irowoon.com"]);
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => t > now - 600000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > now - 600000)) hits.delete(k);
  return list.length > 10;
}
router.post("/public/check-lead", async (req, res) => {
  if (!ORIGINS.has(String(req.headers.origin ?? ""))) { res.status(403).json({ error: "허용되지 않은 요청입니다." }); return; }
  // Render 앞단 프록시 뒤라 실제 IP 는 X-Forwarded-For 첫 번째 값이다.
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.ip || "?";
  if (limited(ip)) { res.status(429).json({ error: "잠시 후 다시 시도해 주세요." }); return; }
  const parsed = checkLeadInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "입력 내용을 확인해 주세요." }); return; }
  await enqueueCheckLead(parsed.data);
  res.json({ ok: true });
});
// 홈페이지 지원금 확인 화면용 가벼운 공고 목록(gzip·5분 캐시). part=open(지금 신청 가능)|past(마감, 작년·올해)
const loadPublic = async () => (await pool.query("SELECT data FROM iroun_benefits ORDER BY updated_at DESC")).rows.map((r) => r.data as Benefit).filter(publicBenefit) as unknown as Record<string, unknown>[];
router.get("/public/check-benefits", async (req, res) => {
  const part: CheckPart = req.query.part === "past" ? "past" : req.query.part === "all" ? "all" : "open";
  const v = await checkList(part, loadPublic);
  res.set({ "Cache-Control": "public, max-age=300, stale-while-revalidate=86400", ETag: v.etag, Vary: "Accept-Encoding", "X-Count": String(v.count) });
  if (req.headers["if-none-match"] === v.etag) { res.status(304).end(); return; }
  res.type("application/json; charset=utf-8");
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) { res.set("Content-Encoding", "gzip").send(v.gz); return; }
  res.send(v.json);
});
// 운영 확인용: 개수만(이름·번호 없음)
router.get("/public/check-lead/status", async (_req, res) => { res.json(await checkLeadStatus()); });
export default router;
