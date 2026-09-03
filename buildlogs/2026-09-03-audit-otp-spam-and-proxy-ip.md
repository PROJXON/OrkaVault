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
2. Audit rows recorded `req.ip`, but the app never set `trust proxy` and
   `req.ip` / the left-most X-Forwarded-For value is client-spoofable
   anyway. On Render (behind the platform load balancer) this meant no
   useful — or trustworthy — client IP for "who revealed this".

## What changed
- backend/src/utils/reqValue.ts: new `clientIp(req)` helper. Reads the
  LAST entry of `X-Forwarded-For` (the address Render's LB saw the
  connection from — set by infra we control, so a client can't forge it
  with its own header), strips `::ffff:` v4-mapped prefixes, falls back
  to the socket address for direct/local connections.
- backend/src/routes/{accounts,misc,users,requests,integrations}.ts: all
  audit-log writes now record `clientIp(req)` instead of `req.ip`.
- backend/src/services/accessRequests.ts: `ipAddress` param widened to
  `string | null | undefined` to accept `clientIp()`'s return.
- backend/src/routes/accounts.ts (reveal-otp): before writing
  `OTP_REVEALED`, skip if an identical row for the same user+account
  exists within the last 5 min (`OTP_AUDIT_DEDUPE_MS`). Collapses the
  per-rotation background re-fetches into one entry; a genuine re-reveal
  after the window still logs.
- backend/src/index.ts: `app.set("trust proxy", 1)` for correct
  req.protocol / req.secure behind the one Render proxy hop.

## Notes / gotchas
- `clientIp()` assumes a SINGLE trusted proxy hop. If another proxy is
  ever added in front of the API (e.g. Cloudflare proxying
  api.<domain>), the last XFF entry becomes that proxy's IP and the
  helper needs revisiting.
- Dedupe window is a local const; tune if the audit trail should show
  continued-access proof more/less often.
- No frontend change — the client still re-fetches per rotation to keep a
  valid code on screen; only server-side logging is suppressed, so audit
  completeness doesn't depend on the client.
- Verified with `tsc --noEmit` (clean). No DB/runtime check — sandbox has
  no Postgres.
