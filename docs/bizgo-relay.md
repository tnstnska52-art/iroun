# CRM Bizgo outbound relay

`POST /api/internal/bizgo-relay` lets the CRM use iroun-api's published Render outbound IP ranges. It is mounted before Clerk and browser middleware and requires its own HMAC authentication. It never grants browser sessions or CORS access.

Set a 64-character lowercase hexadecimal `BIZGO_RELAY_SECRET` in Render and the same secret in the CRM runtime. No secret is committed. CRM sets `BIZGO_RELAY_URL` to `https://iroun-api.onrender.com/api/internal/bizgo-relay`.

The signature is HMAC-SHA256(secret, timestamp + '.' + nonce + '.' + rawJSON), encoded lowercase hexadecimal. Headers: `x-iroun-timestamp` (milliseconds), `x-iroun-nonce` (UUID), `x-iroun-signature`. Requests expire after 60 seconds; recently used nonces are rejected. JSON body maximum 64 KiB. Allowed payload: environment, method, path, apiKey, and optional string body. Only hardcoded Bizgo profile/template/report GETs and the existing production single-recipient Alimtalk POST are forwarded. POST requires the original CRM idempotency key and TTL. Redirects and retries are disabled. Credentials, bodies, signatures and provider messages must never be logged.

On 2026-11-20 the live Render Dashboard for iroun-api listed `74.220.52.0/24` and `74.220.60.0/24`. Register both in the Bizgo API key allowlist. These are shared regional ranges, not exclusive company IPs. Recheck Connect → Outbound if the service region or instance changes. A successful read-only CRM API·채널 확인 proves authentication and profile lookup only; it does not send a customer message.

Validate with Node 24: `node --test artifacts/api-server/src/lib/bizgo-relay.node.test.mjs`. Tests use only mock provider traffic. The existing `/api/healthz`, customer routes and authentication remain unchanged.
