# Fix: Registration 500s After the First User
Date: 2026-07-21

## Why
User hit a 500 on `POST /api/auth/register` while testing (registering a
second account after the first succeeded). Backend log showed:
`P2002 Unique constraint failed on the fields: (googleId)`.

Root cause: `frontend/src/pages/Register.jsx:24` initializes `googleId`
state to `""` and always includes it in the register payload, even for a
plain email/password signup (not just the Google SSO autofill path).
`User.googleId` is `String? @unique` — Postgres allows any number of rows
with a `NULL` in a unique column, but **not** duplicate non-null values,
and `""` is a real (non-null) value. First registration stored
`googleId: ""` successfully; every registration after that collided with
it.

## What changed
- `backend/src/routes/auth.ts:55`: `googleId: googleId || null` instead
  of passing the raw (possibly `""`) value straight through to
  `prisma.user.create`. Normalizing at the backend boundary rather than
  fixing the frontend's default, since the API shouldn't trust "falsy
  string means absent" logic to happen upstream — same reasoning as
  other empty-string-to-null normalization already in this file
  (`collectionId === "" ? null : collectionId` elsewhere in the
  codebase).

## Notes / gotchas
- Did not need to clean up the pre-existing `""` row — new registrations
  now get `null`, and Postgres allows unlimited `NULL`s in a unique
  column, so the old row doesn't block anything going forward.
- The two other `googleId` write sites (`auth.ts:192`, `auth.ts:232`,
  both in the `POST /google` OAuth flow) were never at risk — that value
  always comes from Google's `sub` claim, never an empty string.
- Verified with `npx tsc --noEmit` in `backend/` (clean). Not otherwise
  unrelated to this session's clearance/bulk-import work — found while
  helping debug a live registration failure.
