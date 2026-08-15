# Assign Managers from the Collections Page
Date: 2026-07-21

## Why
Manager-to-Collection assignment only existed on `/users` (edit a user,
set role to Manager, check boxes in a "Managed Collections" list inside
that modal). User found that unintuitive when looking for it from the
Collections side and asked for the same assignment to also be available
on `/collections` — redundant on purpose, not a replacement.

## What changed
- `backend/src/routes/collections.ts`: `GET /` and `PATCH /:id` now
  `include: { managers: { select: id, name, email } }`. `PATCH /:id`
  accepts an optional `managerIds: string[]` and applies it via
  `managers: { set: managerIds.map(id => ({id})) } }` — same
  `User<->Collection` relation `PATCH /api/users/:id/profile`'s
  `managedCollectionIds` already writes, just from the other side.
- `frontend/src/pages/Collections.jsx`: fetches `/users` alongside
  `/collections` and filters to `role === "MANAGER"` for the picker.
  Edit-collection form gets a checkbox list (shown only while editing an
  existing collection, mirroring the `Users.jsx` pattern) plus a new
  "Managers" column in the table so assignment is visible without
  opening Edit.
- `ARCHITECTURE.md`: noted the reciprocal `managerIds` field on the
  collections route table line.

## Notes / gotchas
- Deliberately did **not** let this page promote a user to Manager —
  the picker only lists users who already have `role === "MANAGER"`
  (set on `/users`). Rationale: role and collection-assignment are
  separate fields, and the actual scope-check middleware
  (`isAccountInManagerScope`) gates on `role === "MANAGER"` first before
  it even looks at assignment — auto-promoting from here would invite a
  second, disconnected place that grants the Manager role, for no real
  benefit. If no managers exist yet, the picker shows a message pointing
  back to `/users` instead of silently offering nothing.
- Verified with `npx tsc --noEmit` in `backend/` (clean). Not exercised
  end-to-end — same environment limitations as the bulk-import work
  (no local Postgres/dev server, `frontend/node_modules` has a
  Windows/Linux platform mismatch blocking `vite build` here).
