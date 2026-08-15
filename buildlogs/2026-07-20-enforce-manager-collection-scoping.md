# Enforce Collection Governance for Manager-reachable Account routes
Date: 2026-07-20

## Why
Security audit finding OV-02 (see `securityaudit.html`): the app's core
"Collection Governance" model — Managers should only act on Accounts
inside their assigned Collections — was documented and modeled in the
schema (`User.managedCollections`, `Account.collectionId`) but never
actually enforced in the backend. Every Manager-reachable route that
touches an Account only checked `role === "MANAGER"`, with no check
against the account's collection. In practice a Manager could reveal the
plaintext password/TOTP seed, approve/deny access, or force a health
re-check on ANY account in the vault, regardless of which collection(s)
they were assigned.

## What changed
- `backend/src/middleware/auth.ts`: added `isAccountInManagerScope(user,
  accountCollectionId)` — ADMIN unrestricted, MANAGER limited to accounts
  whose `collectionId` is in their `managedCollections`, accounts with no
  collection assigned are out of scope for every manager.
- `backend/src/routes/accounts.ts`: added the scope check to
  `POST /:id/reveal` and `POST /:id/reveal-qr`, after the account is
  loaded and before the secret is fetched/audited.
- `backend/src/routes/requests.ts`: added the scope check inside the
  `$transaction` for `PATCH /:id/approve` and `PATCH /:id/deny` (fetches
  `account.collectionId` via the transaction client, throws `FORBIDDEN`
  which is mapped to a 403 outside the transaction, same pattern already
  used for the existing `CONFLICT`/409 race-condition handling).
- `backend/src/routes/misc.ts`: added the scope check to
  `POST /health/check/:id` before it decrypts the account's secret to
  re-score it.
- `ARCHITECTURE.md` updated with a note describing the new helper and
  which routes must call it.

## Notes / gotchas
- `requireRole("MANAGER","ADMIN")` on these routes is now necessary but
  not sufficient — any new Manager-reachable route added later that reads
  or mutates an `Account` must also call `isAccountInManagerScope`, or the
  same gap reopens. Flagged in `ARCHITECTURE.md` for future sessions.
- USER-role logic (the existing `AccessGrant` check on reveal endpoints)
  is untouched — this only adds a check for the MANAGER branch.
- Did not touch `POST /api/accounts` (account creation) — that route is
  currently `requireRole("ADMIN")`-only regardless of the collection
  question (separate finding, OV-29, left as-is pending a decision on
  whether Managers should be able to submit new entries at all).
- Verified with `npx tsc --noEmit` in `backend/` — clean compile, no
  runtime/integration test exists yet to exercise these paths (no test
  suite in this repo currently).
