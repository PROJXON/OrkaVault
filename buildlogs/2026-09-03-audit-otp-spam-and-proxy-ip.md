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
2. `req.ip` was threaded into every audit write correctly, but the app
   never set `trust proxy`. Behind Render's load balancer that makes
   `req.ip` the proxy address, so deployed audit rows had no useful
   client IP.

## What changed
- backend/src/routes/accounts.ts: reveal-otp now checks for an existing
  `OTP_REVEALED` row for the same user+account within the last 5 minutes
  and skips the audit write if one exists. Collapses the per-rotation
  background re-fetches into a single entry; a genuine re-reveal after
  the window still logs.
- backend/src/index.ts: `app.set("trust proxy", 1)` — trust exactly one
  proxy hop so `req.ip` resolves from `X-Forwarded-For` without trusting
  a client-supplied chain.

## Notes / gotchas
- Dedupe window is a local const (`OTP_AUDIT_DEDUPE_MS`, 5 min). Tune
  there if the audit trail should show continued-access proof more or
  less often.
- No frontend change: the client still re-fetches per rotation to keep a
  valid code on screen; only the server-side logging is suppressed, so
  audit completeness doesn't depend on the client.
- Verified with `tsc --noEmit` (both files clean). No DB/runtime check —
  sandbox has no Postgres.
