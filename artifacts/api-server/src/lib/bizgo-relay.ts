import { createHmac, timingSafeEqual } from "node:crypto";

const origins = { production: "https://mars.ibapi.kr", sandbox: "https://sandbox-mars.ibapi.kr" };
const maxBytes = 65536;
type RelayResult = { status: number; body: string };
type RelayInput = { raw: Buffer; timestamp: string; nonce: string; signature: string };
const failure = (status: number, code: string): RelayResult => ({ status, body: JSON.stringify({ code }) });

// No configurable upstream URL, forwarded cookies, redirects, or retries.
function allowedPath(method: string, path: string) {
  if (path.length > 2000 || !path.startsWith("/api/comm/v1/") || /[\\#\r\n]/.test(path)) return false;
  const url = new URL(path, origins.production);
  if (url.pathname !== path.split("?")[0]) return false;
  if (method === "POST") return path === "/api/comm/v1/send/omni";
  if (method !== "GET") return false;
  const params = [...url.searchParams.entries()];
  if (url.pathname === "/api/comm/v1/account/kakao/sender") {
    return params.length === 1 && ["uuid", "senderKey"].includes(params[0][0]) && !!params[0][1] && params[0][1].length <= 200;
  }
  if (url.pathname === "/api/comm/v1/center/alimtalk/template") {
    return params.length === 2 && new Set(params.map(([key]) => key)).size === 2 && params.every(([key, value]) => ["senderKey", "templateCode"].includes(key) && !!value && value.length <= 200);
  }
  if (url.search) return false;
  try { return /^\/api\/comm\/v1\/report\/inquiry\/[A-Za-z0-9_.:-]{1,200}$/.test(decodeURIComponent(path)); } catch { return false; }
}

export function createBizgoRelay(options: { secret: () => string; fetch?: typeof fetch; now?: () => number }) {
  const upstream = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const used = new Map<string, number>();
  let active = 0;
  return async ({ raw, timestamp, nonce, signature }: RelayInput): Promise<RelayResult> => {
    const secret = options.secret();
    if (!/^[a-f0-9]{64}$/.test(secret)) return failure(503, "BIZGO_RELAY_UNCONFIGURED");
    if (!Buffer.isBuffer(raw) || raw.length > maxBytes) return failure(413, "BIZGO_RELAY_SIZE");
    const time = now();
    if (!/^\d{13}$/.test(timestamp) || Math.abs(time - Number(timestamp)) > 60000 || !/^[a-f0-9-]{36}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return failure(401, "BIZGO_RELAY_AUTH");
    const expected = createHmac("sha256", secret).update(timestamp + "." + nonce + ".").update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return failure(401, "BIZGO_RELAY_AUTH");
    for (const [key, expires] of used) if (expires < time) used.delete(key);
    if (used.has(nonce)) return failure(409, "BIZGO_RELAY_REPLAY");
    if (used.size >= 5000 || active >= 32) return failure(429, "BIZGO_RELAY_BUSY");
    used.set(nonce, Number(timestamp) + 120000);
    let request: { environment?: string; method?: string; path?: string; apiKey?: string; body?: string };
    try { request = JSON.parse(raw.toString("utf8")); } catch { return failure(400, "BIZGO_RELAY_INPUT"); }
    if (!request || typeof request !== "object" || !["production", "sandbox"].includes(request.environment || "") || typeof request.path !== "string" || !allowedPath(request.method || "", request.path) || typeof request.apiKey !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(request.apiKey)) return failure(400, "BIZGO_RELAY_INPUT");
    if (request.method === "GET" && request.body !== undefined) return failure(400, "BIZGO_RELAY_INPUT");
    if (request.method === "POST") {
      try {
        if (request.environment !== "production" || typeof request.body !== "string") throw Error();
        const payload = JSON.parse(request.body);
        if (typeof payload.idempotencyKey !== "string" || !/^bp-today-[a-f0-9-]{1,100}$/.test(payload.idempotencyKey) || payload.idempotencyTtl !== 86400 || !Array.isArray(payload.destinations) || payload.destinations.length !== 1 || !Array.isArray(payload.messageFlow) || payload.messageFlow.length !== 1 || !payload.messageFlow[0].alimtalk || Object.keys(payload.messageFlow[0]).length !== 1) throw Error();
      } catch { return failure(400, "BIZGO_RELAY_INPUT"); }
    }
    active++;
    try {
      const response = await upstream(origins[request.environment as keyof typeof origins] + request.path, {
        method: request.method,
        headers: { Authorization: request.apiKey, Accept: "application/json", ...(request.method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "manual", signal: AbortSignal.timeout(request.method === "POST" ? 6500 : 10000),
      });
      if (response.status >= 300 && response.status < 400) { void response.body?.cancel(); return failure(502, "BIZGO_RELAY_REDIRECT"); }
      if (Number(response.headers.get("content-length") || 0) > maxBytes || !response.body) { void response.body?.cancel(); return failure(502, "BIZGO_RELAY_RESPONSE"); }
      const chunks: Uint8Array[] = []; let size = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length; if (size > maxBytes) { void reader.cancel(); return failure(502, "BIZGO_RELAY_RESPONSE"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const body = Buffer.concat(chunks).toString("utf8");
      const value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) return failure(502, "BIZGO_RELAY_RESPONSE");
      return { status: response.status, body };
    } catch { return failure(502, "BIZGO_RELAY_UPSTREAM"); }
    finally { active--; }
  };
}
