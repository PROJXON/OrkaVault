# Google Workspace recovery email/phone — "Recovery" tab
Date: 2026-09-02

## Why
NEW.md item 5: surface recovery emails for Google Workspace accounts.

The Admin SDK Directory API exposes `recoveryEmail` / `recoveryPhone` on the
User resource — but only the **admin-set** values (Admin console → user →
Security → Recovery information). The recovery info a user configures for
themselves at myaccount.google.com is stored separately by Google and is not
readable through any admin API. So this feature shows the admin-managed
recovery contacts org-wide; it will be blank for accounts where only the
user set their own, and may differ from what the user set.

Readable with `admin.directory.user.readonly`, already in `SCOPES` — no new
scope, no domain-wide-delegation re-authorization in the Google console.

## What changed
- backend/prisma/schema.prisma: new `WorkspaceRecoveryInfo` model — snapshot,
  `userEmail` unique, `recoveryEmail` / `recoveryPhone` / `lastSyncedAt`.
- backend/prisma/migrations/20260902120000_workspace_recovery_info/migration.sql:
  hand-written (no DB in this sandbox to run `prisma migrate dev`). CREATE
  TABLE + unique index on userEmail + index on userEmail.
- backend/src/services/googleWorkspace.ts: `fetchWorkspaceRecoveryInfo()`
  (paginated `users.list`, field-masked), `fetchWorkspaceRecoveryInfoForUser()`
  (`users.get`), `syncWorkspaceRecovery()` (cron: upsert + delete-stale,
  no-op until Workspace monitoring configured, never throws),
  `syncWorkspaceRecoveryForUser()`. Mirrors the WorkspaceDevice sync pattern.
- backend/src/routes/workspaceActivity.ts: `GET /recovery`,
  `GET /recovery/users` (active accounts left-joined with the snapshot,
  inline — no expand step), `POST /recovery/sync`,
  `POST /recovery/sync/:userEmail`. All ADMIN.
- backend/src/index.ts: `syncWorkspaceRecovery()` on startup + every 6h,
  alongside the other Workspace crons.
- frontend/src/pages/WorkspaceActivity.jsx: new `RecoveryTab` + "Recovery"
  tab. Searchable list of every active account with its admin-set recovery
  email/phone, "last synced" time, per-row Refresh, and a "Sync all from
  Google" button. Tab copy spells out the admin-set vs. user-set caveat.
- ARCHITECTURE.md: route table, services entry, cron list, data model.

## Notes / gotchas
- Run `npm run prisma:migrate` (or `prisma migrate deploy` + `prisma generate`)
  in `backend/` to apply the migration and regenerate the client. `prisma
  generate` was run here so the backend type-checks (`tsc --noEmit` clean),
  but the generated client is gitignored.
- Could not run either dev server in this sandbox (frontend `node_modules`
  is Windows-native `@rolldown/binding-win32-x64-msvc`; no local Postgres).
  Verified: backend `tsc --noEmit` passes; frontend parsed with acorn-jsx.
  Needs a real click-through on Windows.
- `/recovery/users` and the sync endpoints will 500 if Workspace monitoring
  isn't configured (no SA key file) — same behaviour as the existing
  `/devices/users` and `/connected-apps/users` endpoints.
- docs/google-workspace-admin-sdk-monitoring.md was not extended; ARCHITECTURE.md
  is the canonical map and carries the new surface.
