# Make Clearance Level Actually Do Something
Date: 2026-07-21

## Why
`User.clearanceLevel` existed (Tier 1/2/3 dropdown on the Users page,
shown on Profile/Directory) but nothing in the backend ever read it — it
was a label, not a permission. User asked what it was for, agreed it was
pointless as-is, and wanted vault entries to carry a required clearance
tier that Users need to meet to request/reveal them.

## What changed
- `backend/prisma/schema.prisma`: added `Account.requiredClearance
  String?` — null means no requirement (every existing account stays
  unrestricted after migration).
- `backend/src/services/clearance.ts` (new): `CLEARANCE_TIERS` (ordered,
  must match the three dropdown strings used everywhere) and
  `meetsClearance(userLevel, requiredLevel)` — unset requirement always
  passes; unset user level ranks below every real tier.
- `frontend/src/lib/clearance.js` (new): same shape, JS side. No shared
  package between the two apps, so these two files must be kept in sync
  by hand (matches how `PlatformType`/`RefreshCycle` are already
  duplicated between frontend dropdowns and backend validation arrays).
- `backend/src/middleware/auth.ts`: `req.user` now carries
  `clearanceLevel` (was fetched from the DB already via the full `User`
  row, just wasn't exposed) — flows through to `GET /auth/me` and thus
  `useAuth()`'s `user` on the frontend for free.
- Enforcement, all gated `role !== "ADMIN"` (ADMIN bypasses, same as
  Collection scope):
  - `backend/src/routes/requests.ts` `POST /` — checks the *requester's*
    clearance before creating the request (also now 404s if the account
    doesn't exist, which it silently didn't check before — needed the
    account loaded here anyway for the check).
  - `backend/src/routes/requests.ts` `PATCH /:id/approve` — checks
    clearance again inside the transaction before creating the grant, so
    an approver gets a clear rejection instead of creating a grant that
    reveal-time enforcement would always block anyway. Restructured to
    always load the account (previously only loaded for the MANAGER
    scope-check branch) and reuse one `requester` fetch for both the
    clearance check and the existing device/international-access update
    logic (previously fetched the user twice).
  - `backend/src/routes/accounts.ts` `POST /:id/reveal` and
    `/:id/reveal-qr` — the real hard boundary: checked at the point the
    secret is actually returned, not just at request-approval time, so a
    clearance requirement raised *after* a grant already exists still
    takes effect immediately.
  - `backend/src/routes/accounts.ts` `POST /` and `PATCH /:id` — accept
    `requiredClearance` from the request body.
  - `backend/src/routes/accounts.ts` `GET /` — returns `requiredClearance`
    per account (needed by the frontend to know what to gate on).
- `frontend/src/components/AddEntryModal.jsx` / `EditEntryModal.jsx`: new
  "Required Clearance" dropdown (optional, `CLEARANCE_TIERS` + "No
  requirement").
- `frontend/src/pages/Vault.jsx`: new `hasSufficientClearance(account)`;
  `hasDirectAccess` now also requires it. Row rendering gets a third
  state — below clearance shows a locked "Insufficient Clearance" label
  instead of Request Access *or* Reveal (covers both "never had a grant"
  and "had a grant, requirement got raised since" cases).
- `frontend/src/pages/ManagerCollections.jsx`: same gating — this page
  renders its own Reveal buttons independent of `Vault.jsx` and had no
  clearance check at all; without this a Manager would click Reveal and
  just get a confusing 403 from the now-enforced backend check.
- `frontend/src/pages/Users.jsx`: clearance dropdown now maps over the
  shared `CLEARANCE_TIERS` instead of three hardcoded `<option>` tags —
  one source of truth within the frontend app.
- `ARCHITECTURE.md`: documented the field, the service, and the
  enforcement points (mirrors the existing Collection-scope note).

## Notes / gotchas
- **Requires a schema migration** — run `npm run prisma:db` (`prisma db
  push`) in `backend/` after pulling this. Ran `npx prisma generate`
  here (schema-only, no DB connection needed) so this environment's
  TypeScript compiles against the new field, but the actual `db push`
  needs a live Postgres connection this sandbox doesn't have — do that
  step wherever the real dev database is.
- Deliberately did **not** touch bulk-import — no `requiredClearance`
  CSV column. Wasn't asked for, and QA/clearance-sensitive entries are
  exactly the kind you'd want to set up carefully one at a time rather
  than in bulk.
- MANAGER clearance is layered on top of Collection scope, not a
  replacement for it — a Manager still needs both the account inside
  their assigned Collection *and* sufficient clearance to get direct
  access. Matches how the user framed it ("each vault entry has a
  clearance level attached, and those users need that clearance level")
  applied uniformly to every non-admin role, not just plain Users.
- Verified with `npx tsc --noEmit` in `backend/` (clean, against the
  regenerated Prisma client). Not exercised end-to-end — same standing
  environment limitation as the rest of today's work (no local Postgres,
  `frontend/node_modules` platform mismatch blocking `vite build` here).
