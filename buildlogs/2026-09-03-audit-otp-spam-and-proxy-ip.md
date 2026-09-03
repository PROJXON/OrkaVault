# Audit log: stop OTP-reveal spam, capture real client IP
Date: 2026-09-03

## Why
Two audit-log problems reported in NEW.md:

1. While an OTP pill is open, `RevealOtp.jsx` silently re-fetches a fresh
   code at every ~30s TOTP rotation boundary. Each fetch hits
   `POST /api/accounts/:id/reveal-otp`, which unconditionally wrote an
   `OTP_REVEALED` audit row — so a single reveal session produced one
   near-identical audit entry per rotation (1-2/min). Only the initial
   reveal should be logged.
2. Audit rows recorded `req.ip`. With no `trust proxy` set, that returns
   the socket peer, which on Render is an internal proxy address
   (`10.25.111.8`) — useless for "who revealed this".

## What changed
- backend/src/utils/reqValue.ts: new `clientIp(req)` helper. Render's
  `X-Forwarded-For` is `<originating client>, <10.x internal proxy>[...]`
  — client first, infra hops appended. The helper picks the first XFF
  entry that isn't a private/internal address (RFC1918, loopback,
  link-local, CGNAT 100.64/10, IPv6 ULA), strips `::ffff:` v4-mapped
  prefixes, and falls back to `req.ip` / socket address for direct/local
  connections.
- backend/src/routes/{accounts,misc,users,requests,integrations}.ts: all
  audit-log writes now record `clientIp(req)` instead of `req.ip`.
- backend/src/services/accessRequests.ts: `ipAddress` param widened to
  `string | null | undefined` to accept `clientIp()`'s return.
- backend/src/routes/accounts.ts (reveal-otp): before writing
  `OTP_REVEALED`, skip if an identical row for the same user+account
  exists within the last 5 min (`OTP_AUDIT_DEDUPE_MS`). Collapses the
  per-rotation background re-fetches into one entry; a genuine re-reveal
  after the window still logs.
- backend/src/index.ts: `app.set("trust proxy", true)` so req.protocol /
  req.secure and the req.ip fallback resolve from X-Forwarded-For.

## Notes / gotchas
- The left-most X-Forwarded-For entry is client-supplied and could be
  forged unless Render/upstream strips it. Acceptable here (authenticated
  internal users); revisit if the threat model changes.
- If another proxy is added in front of the API (e.g. Cloudflare proxying
  api.<domain>), re-check which XFF entry is the real client.
- Dedupe window is a local const; tune if the audit trail should show
  continued-access proof more/less often.
- No frontend change — the client still re-fetches per rotation to keep a
  valid code on screen; only server-side logging is suppressed.
- Verified with `tsc --noEmit` (clean). No DB/runtime check — sandbox has
  no Postgres.
