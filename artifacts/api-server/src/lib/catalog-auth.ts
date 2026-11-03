import { createHmac, timingSafeEqual } from "node:crypto";

/** 기존 CRM 공동 키로 서명한 서버 전용 조회. 브라우저 플래그로 계약 목록을 열 수 없다. */
export function trustedCatalogRequest(
  input: { timestamp: string; signature: string; method: string; path: string; origin?: string },
  secret = process.env.CRM_APP_PROFILE_SECRET,
  now = Date.now(),
): boolean {
  if (!secret || !/^[a-f\d]{64}$/i.test(secret) || input.origin || input.method !== "GET") return false;
  if (!/^\d{10}$/.test(input.timestamp) || Math.abs(now / 1000 - Number(input.timestamp)) > 300) return false;
  if (!/^[a-f\d]{64}$/.test(input.signature)) return false;
  const expected = createHmac("sha256", secret).update(`${input.timestamp}\nGET\n${input.path}\n`).digest();
  return timingSafeEqual(expected, Buffer.from(input.signature, "hex"));
}
