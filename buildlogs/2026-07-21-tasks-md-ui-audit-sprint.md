# TASKS.md sprint: reveal-copy, Collections UX, bulk delete, audit retention
Date: 2026-07-21

## Why
Batch of items from `TASKS.md`: easier credential copying, better
Collections management UX, missing columns/context on Health and Audit
pages, bigger/clearer catalog action icons, an explicit owner name on
Force Rotate's confirmation, bulk delete for Users and Accounts with a
typed-confirmation safety gate, and an audit-log retention + CSV backup
setting.

## What changed
- `frontend/src/components/RevealPassword.jsx`, `RevealOtp.jsx`: click
  the revealed value to copy to clipboard; shows a "Copied!" confirmation
  for 1.5s. Deliberately still blocks text selection/right-click — this
  adds an explicit copy action, it doesn't remove the anti-shoulder-surf
  friction.
- `frontend/src/pages/Collections.jsx`: rewritten — "+" button opens the
  create form; editing a collection expands that row inline (table row on
  desktop, in-card on mobile) instead of a separate always-visible panel.
- `frontend/src/pages/Health.jsx`, `backend/src/routes/misc.ts`,
  `backend/src/routes/accounts.ts`: added a "Last Changed" column, backed
  by a new `Account.lastUpdatedAt` write (previously an unused schema
  field) stamped whenever a password is actually changed; falls back to
  `createdAt` if never changed.
- `frontend/src/index.css`, `frontend/src/pages/Vault.jsx`: catalog
  action icons (Bulk Import / Add Entry / QR Pending) bumped 16px→20px,
  `.iconbtn` slightly larger, QR-pending badge offset further off the
  icon so it doesn't overlap.
- `frontend/src/pages/Vault.jsx`, `backend/src/routes/accounts.ts`: Force
  Rotate's confirm dialog now names the account owner (`ownerName`/
  `ownerEmail`, resolved server-side for ADMIN in `GET /accounts` since
  `Account.ownerId` isn't a Prisma relation) instead of saying "the
  owner".
- `frontend/src/pages/Users.jsx`: added an End Date column (data was
  already in the API response, just wasn't rendered); added multi-select
  + "Delete Selected" with a modal requiring the literal text "approve"
  before the action is enabled.
- `backend/src/routes/users.ts`: `POST /users/bulk-delete` [ADMIN] —
  same soft-delete semantics as the existing `DELETE /:id` (deactivate +
  revoke grants), one `AuditLog` row per user.
- `frontend/src/pages/Vault.jsx`: same bulk-select + typed-confirmation
  pattern for vault entries (catalog pane, ADMIN only).
- `backend/src/routes/accounts.ts`: `POST /accounts/bulk-delete` [ADMIN]
  — hard-deletes accounts + secrets like the existing `DELETE /:id`, one
  `AuditLog` row per account.
- `frontend/src/pages/Audit.jsx`, `backend/src/routes/misc.ts`: Audit log
  now shows the acting user's department (added to the `user` select on
  `GET /audit`).
- `backend/src/services/auditBackup.ts` (new), `backend/src/routes/backups.ts`
  (new), `backend/src/index.ts`: audit-log retention sweep — rows older
  than `AUDIT_LOG_RETENTION_DAYS` (an `OrganizationPolicy`, unset = keep
  forever) get written to a CSV under `backend/backups/` and purged from
  Postgres (write-then-delete, so a failed write never loses rows); old
  backup files beyond `MAX_AUDIT_BACKUPS` get trimmed. Runs on the
  existing 24h cron pattern, plus `POST /backups/run` for on-demand runs.
- `frontend/src/pages/Settings.jsx`: new "Backups" tab — retention/max
  settings, a list of existing backups with download links, "Run Backup
  Now".
- `docs/suggested-features.md` (new): eight feature proposals scoped to
  "no added end-user complexity, real security/sharing benefit" per the
  TASKS.md ask — password generator, dual approval for top clearance,
  self-service grant renewal, per-account reveal time windows, dormant-
  account nudges, WebAuthn login, one-click share-with-teammate, digest
  notifications.
- `ARCHITECTURE.md`: route table, services table, and data-model section
  updated for `/api/backups`, `Account.lastUpdatedAt` usage, and the
  bulk-delete endpoints.

## Notes / gotchas
- `backend/backups/` is gitignored (added to `backend/.gitignore`) — CSVs
  contain org activity data and shouldn't land in the repo.
- The `AUDIT_LOG_RETENTION_DAYS` policy defaults to unset, i.e. retention
  is **off** until an admin opts in from Settings > Backups — no existing
  audit history disappears on deploy.
- Bulk delete for Users reuses the existing single-user "deactivate,
  don't hard-delete" semantics (matches the current `DELETE /:id`
  behavior) rather than introducing a new hard-delete path for users.
