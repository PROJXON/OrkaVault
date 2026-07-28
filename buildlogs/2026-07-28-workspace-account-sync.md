# Auto-populate vault entries from Google Workspace
Date: 2026-07-28

## Why
Vault entries for each employee's own Google Workspace login were
created by hand, one at a time. The Connected Apps work already built
`listActiveWorkspaceUsers()` (Directory API `users.list`) to enumerate
every active Workspace account — this reuses it so an ADMIN can generate
the missing vault entries in one click instead of manually re-typing
each person's name/email/platform type.

Decisions from the user:
- Trigger: an ADMIN-clicked button, not a background cron — no surprise
  writes to the vault.
- Unmatched owner: if a Workspace account's email doesn't match any
  existing OrkaVault `User`, still create the entry, owned by the admin
  who triggered the sync (flagged in `notes`), rather than skipping it.
- QA status: `APPROVED` immediately, matching how `bulk-import` already
  behaves, not sent through the `PENDING` QA queue.
- Matching rule (explicitly requested): create-only, never
  update/overwrite/merge an existing entry. A Workspace account is
  skipped if **any** existing `Account` (any `platformType`, not just
  `GOOGLE_WORKSPACE`) already has that email as its `username`, matched
  case-insensitively.

## What changed
- `backend/src/services/googleWorkspace.ts`: `listActiveWorkspaceUsers()`
  used to return `string[]` of emails only, discarding the Directory
  API's `user.name?.fullName`/`displayName`. Changed its return type to
  `WorkspaceUser[]` (`{ email, displayName }`) so stub Account creation
  can use a real name instead of just the email. Updated its two
  existing callers (`routes/workspaceActivity.ts`'s
  `GET /connected-apps/users`, and `syncConnectedApps()`'s own loop) to
  destructure `{ email }` instead of treating the array as plain
  strings.
- New `backend/src/services/workspaceAccountSync.ts`:
  `syncWorkspaceAccountsToVault(triggeredByUserId)` — kept separate from
  `googleWorkspace.ts` (which owns Workspace *monitoring*, a different
  concern from Account *provisioning*). For each active Workspace user
  not already matched to an existing `Account.username`, creates one
  with `platformType: "GOOGLE_WORKSPACE"`, `isGoogleSSO: true`,
  `secretRef: "SSO_ONLY"` (the existing sentinel for "no real secret to
  store" — these track break-glass/offboarding access to each person's
  own login, not a shared password), `qaStatus: "APPROVED"`,
  `refreshCycle: "MANUAL"` (no real secret to rotate), `ownerId` matched
  to an OrkaVault `User` by email or else the triggering admin, and a
  `notes` marker (`[AUTO-SYNCED] ...`) — including a distinct message
  when the owner had to fall back to the admin, so it's easy to find and
  reassign later. Writes one `AuditLog` row per created account
  (`WORKSPACE_ACCOUNT_AUTO_CREATED`), matching the existing
  bulk-delete/bulk-import convention.
- `backend/src/routes/accounts.ts`: new `POST /accounts/sync-workspace`
  [ADMIN], calls the new service, returns `{ created, skipped }`.
- `frontend/src/pages/Vault.jsx`: new "Sync Workspace Accounts" icon
  button (ADMIN-only) in the catalog pane, alongside the existing Bulk
  Import/Add Entry buttons — a third way to create Accounts, so it lives
  next to the other two rather than on a separate page. Reuses the
  existing `fetchAccounts()` refresh callback and the same
  `alert()`-based feedback pattern already used by
  `handleForceRotate`/`handleBulkDeleteAccounts` — no new modal needed,
  this is a single fire-and-wait action.
- `ARCHITECTURE.md`: added the new service to §2's table, the new route
  to §2's `/api/accounts` row.

## Notes / gotchas
- No schema migration needed — this reuses the `Account` model exactly
  as-is (`isGoogleSSO`/`secretRef: "SSO_ONLY"` was already a supported
  state for manually-created SSO entries, so the reveal/request UI
  already handles these rows correctly with zero frontend display
  changes).
- No live Postgres/Google credentials in this sandbox — backend
  type-checks clean (`tsc --noEmit`), but real end-to-end verification
  (click the button, confirm N new `Account` rows with correct
  `isGoogleSSO`/`secretRef`/`ownerId`/`qaStatus`/`notes`, confirm a
  second run is a no-op) has to happen in the user's own environment.
- The `notes` marker distinguishes two cases (owner matched vs. admin
  fallback) specifically so an admin scanning the vault later can tell,
  without cross-referencing anything else, which auto-synced entries
  need their ownership corrected.
