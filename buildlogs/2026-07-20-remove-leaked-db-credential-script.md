# Remove ad hoc scripts with a hardcoded production DB credential
Date: 2026-07-20

## Why
A full security audit (see `securityaudit.html`, finding OV-01) found
`backend/update-role.js` contained a live Neon Postgres connection string
with embedded credentials, hardcoded in source instead of read from
`DATABASE_URL`. Neither it nor its sibling `backend/migrate_6_to_4.ts`
were covered by `.gitignore`'s "Temp / Debug Scripts" exclusion list
(unlike `check_db.ts`, `get_admin.ts`, `reset_admin.ts`, `test_api.js`,
`test_update.ts`, `run_tests.ts`, which were), so both were likely
committed to git history.

## What changed
- Deleted `backend/update-role.js` (one-off script that added `USER` to
  the `Role` enum and migrated leftover `HOLDER`-role users to `USER`;
  already reflected in current `schema.prisma`, no longer needed).
- Deleted `backend/migrate_6_to_4.ts` (one-off script that converted
  `SIX_MONTHS` refresh cycles to `FOUR_MONTHS`; also already reflected in
  current data/schema, no longer needed).
- Updated `ARCHITECTURE.md` to drop the stale reference to both files and
  added a note against leaving ad hoc migration scripts at the `backend/`
  root going forward.

## Notes / gotchas
- Deleting the files does **not** remove the leaked credential from git
  history if either was ever committed — that still needs a history
  scrub (`git filter-repo`/BFG) plus a force-push, which was intentionally
  left for the user to drive given the shared-history implications.
- The Neon database password itself still needs rotation regardless of
  git-tracked status, since the string was exposed on disk either way.
  Not done as part of this change — requires action in the Neon dashboard.
- `secretManager.ts`'s local encryption fallback derives its AES key from
  `DATABASE_URL` (see OV-04 in the audit) — rotating the DB password
  before decoupling that key will break decryption of any vault secrets
  currently stored under the old key. Flagged to the user; not yet fixed.
