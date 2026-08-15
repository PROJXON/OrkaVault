# Full-codebase security review: fixed 4 access-control/token-forgery gaps
Date: 2026-07-29

## Why
Follow-up to the earlier diff-scoped security review the same day
(`2026-07-29-security-review-mfa-bypass-fix-and-dep-updates.md`). User
asked for a full-codebase review (not just this branch's diff) covering
every entry point/form, object-access/IDOR, and session/token theft —
specifically: "Users should not be able to steal a session token and
access the site."

Methodology: 3 parallel identification passes (entry-points/input-
validation, IDOR/object-access, session/token-theft), each covering the
whole app, not the diff. 5 distinct candidate findings surfaced (several
found independently by more than one pass — strong signal). Each
candidate got its own independent verification sub-task against the
same false-positive-filtering bar as the earlier review, with one
adjustment: this being a full-app review rather than a diff review,
"pre-existing" was explicitly NOT treated as a disqualifier. 4 of 5
confirmed at confidence ≥8 and were fixed; 1 (notifications ownership
check) was investigated hard but scored 3 — real inconsistency, but no
channel anywhere in the app discloses another user's `Notification.id`
to exploit it, and per this project's own precedent, unguessable UUIDs
don't need defensive validation on their own.

## What changed

- **`backend/src/routes/accounts.ts`** (`GET /:id`) — was `requireAuth`
  only, spreading the full `Account` row into the response with just
  `secretRef` stripped. This leaked `totpQrBase64` (the raw TOTP QR
  image — decodable client-side to the permanent `otpauth://` secret,
  giving unlimited OTP generation forever, completely bypassing
  `reveal-otp`'s grant/clearance/manager-scope gate) and `passwordHash`
  to any authenticated user, for any account, with zero grant or
  clearance check — account ids are freely listable via `GET /`. Fixed
  by hand-selecting only the same non-secret metadata already visible
  to everyone via the list route (matching that route's existing
  visibility model exactly, rather than inventing new semantics), and
  restricting other users' grant-holder identities to ADMIN callers.
  `totpQrBase64`/`passwordHash`/`secretRef` are now never spread into
  any response from this route.
- **`backend/src/routes/directory.ts`** — added `requireRole("ADMIN")`
  after `requireAuth`. The route had no role check at all despite being
  documented (`ARCHITECTURE.md`) and frontend-gated as admin-only; any
  authenticated USER could call it directly for the full org roster,
  clearance levels, device inventories, and every active credential
  grant org-wide.
- **`backend/src/routes/requests.ts`** (`GET /`) — the MANAGER/ADMIN
  branch ran an unfiltered `findMany` with no collection scoping, unlike
  `approve`/`deny` (`services/accessRequests.ts`), which already enforce
  `isInManagerScope`. Split into a MANAGER branch (filtered to
  `account.collectionId IN managedCollections`, mirroring
  `isAccountInManagerScope`'s semantics) and an unrestricted ADMIN
  branch. This wasn't just a crafted-request issue — the normal
  `Approvals.jsx` page a Manager uses daily was rendering this unscoped
  data.
- **`backend/src/middleware/auth.ts`** + **`backend/src/routes/auth.ts`**
  — removed the hardcoded fallback strings for both `JWT_SECRET` and
  `JWT_REFRESH_SECRET` (`"orkavault_local_development_jwt_..."`,
  public in this source tree). The module now throws at import time
  (server refuses to start) if either env var is unset. `JWT_REFRESH_SECRET`
  was never mentioned in `.env.example`/README/ARCHITECTURE (unlike
  `JWT_SECRET`, which was) — a deployer following `.env.example`
  literally would silently ship with refresh tokens signed by a public
  string. Combined with the (now-fixed) directory leak of every user's
  `id`/`email`/`role`, this allowed forging a refresh token for any
  known userId (e.g. an admin) offline and exchanging it at
  `POST /api/auth/refresh` — which does no server-side session/token-
  hash tracking, just a signature + DB-active check — for a fully
  legitimate access token. Full account takeover, no token theft
  required at all. Also exported `JWT_SECRET` from `middleware/auth.ts`
  and removed the three places `routes/auth.ts` was separately
  redeclaring its own local copy of the same fallback pattern (login,
  google-login, mfa/verify) — single source of truth now.
- **`backend/.env.example`** — added `JWT_REFRESH_SECRET` alongside
  `JWT_SECRET`, both now documented as required.

## Notes / gotchas
- Verified the startup guard both ways: confirmed the module throws
  when either secret is unset (`node -e "require('ts-node/register');
  require('./src/middleware/auth.ts')"` with no env vars → throws with
  the intended message) and loads cleanly when both are set.
  `tsc --noEmit` clean throughout.
- The `GET /accounts/:id` fix relies on TS `const`-narrowing across a
  throw guard for the exported `JWT_SECRET`/`JWT_REFRESH_SECRET`
  pattern in `middleware/auth.ts` — used intermediate `rawJwtSecret`/
  `rawJwtRefreshSecret` locals typed `string | undefined`, guarded with
  a throw, then re-declared as explicitly-typed `string` exports, since
  cross-module type narrowing doesn't propagate through a plain
  `export const` the way same-module narrowing does.
- `GET /api/accounts/:id` turned out to have zero frontend callers
  (grepped `frontend/src` for `/accounts/${` — nothing hits the bare
  `:id` route, only `/reveal`, `/reveal-otp`, `/reveal-qr`, etc.), so
  this fix carries no risk of changing current app behavior; it closes
  the hole for any future or external caller of that route.
- Didn't touch: refresh-token rotation/revocation (the underlying
  stateless-JWT design still allows a valid refresh token to mint
  unlimited access tokens until its 7-day expiry) — flagged by the
  verifying agent as a legitimate defense-in-depth gap but a bigger
  architectural change (a session/revocation table) than this pass's
  scope; worth a follow-up if wanted.
