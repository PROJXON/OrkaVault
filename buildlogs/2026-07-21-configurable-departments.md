# Configurable departments + inline dropdown editing
Date: 2026-07-21

## Why
`TASKS.md` items 1–2: departments were hardcoded (duplicated across
`Register.jsx`, `Profile.jsx`, `Users.jsx`, `seedMockDirectory.ts`) with
no admin-facing way to change the list, and department assignment in
Users & Roles was plain text instead of an inline dropdown like the Role
column already had.

## What changed
- backend/prisma/schema.prisma: new `Department` model (`id`, unique
  `name`, timestamps). `User.department` stays a free-text `String`, not
  a relation — see the model comment for why.
- backend/src/routes/departments.ts: new router — GET `/` is public
  (Register.jsx needs it pre-auth), POST/PATCH/DELETE are ADMIN-only.
  DELETE is blocked (409) if any `User.department` still matches the
  name. Also exports `seedDefaultDepartments()`.
- backend/src/index.ts: mounts `/api/departments`; calls
  `seedDefaultDepartments()` once on startup (no-op once the table has
  any rows) — seeds the old hardcoded 8 names plus any distinct
  `User.department` values already in the DB, so existing assignments
  don't silently disappear from the dropdown after this ships.
- frontend/src/pages/Settings.jsx: split into `PoliciesTab` (unchanged
  behavior) + new `DepartmentsTab` behind a tab nav — list, add, inline
  rename, delete (with a confirm prompt).
- frontend/src/pages/Users.jsx: Department column in the main table is
  now an inline `<select>` that saves immediately via `PATCH
  /api/users/:id/profile`, mirroring the existing Role column's
  behavior. Both the filter dropdown and the edit-modal dropdown now
  pull from `/api/departments` instead of a hardcoded array.
- frontend/src/pages/Profile.jsx, Register.jsx: same — hardcoded
  `DEPARTMENTS` arrays replaced with a fetch from `/api/departments`.
- ARCHITECTURE.md: added the Department model to §4 and the route to
  the §2 route table.

## Notes / gotchas
- Renaming a department does **not** propagate to users already
  assigned the old name (it's a free-text field, not a relation) — an
  admin has to reassign them afterward if they want the rename to
  stick everywhere.
- Verified: backend `tsc --noEmit` clean after `prisma generate`;
  frontend files transform cleanly under Vite (checked via the dev
  server's module endpoint, 200 not 500, for each edited page).
  **Not** verified end-to-end against a live DB in this session — no
  local Postgres was running and I didn't start it. Run `npm run
  prisma:db` from `backend/` before starting the API.
