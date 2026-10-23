# Secure Note entry type + catalog tile icons

Phase 3 of `plan/` (NEW.md requests). **Schema change: migration must be
applied locally** (`npm run prisma:migrate` or `npx prisma migrate deploy`
in `backend/`).

## Why
Users wanted a Bitwarden-style "note" entry, and an icon on catalog tiles
showing what kind of entry each one is. Per the user, only Login + Secure
Note: other types (API key, SSH, card, …) won't be used.

## What changed
- `schema.prisma` + `migrations/20261022180000_account_entry_type/`: new
  `EntryType` enum (`LOGIN`, `SECURE_NOTE`) and `Account.entryType`
  (default `LOGIN`, which backfills every existing row).
- `services/entryTypes.ts` (new): one rules row per type (requiresUsername,
  scoresHealth, rotates, allowsTotpQr, allowsSso, maxSecretLength).
- `routes/accounts.ts`:
  - Create accepts `entryType`. For notes, `password` is the note body
    (≤10,000 chars) and is stored via `storeSecret` like a password.
    Username is stored as `""`. Login-only fields (QR, SSO, refreshCycle)
    are dropped.
  - Notes get no health scoring, no reuse hash, no weak-password alerts,
    no RotationSchedule (on create or QA approve) and no QR requirement.
  - PATCH rejects a type change and handles a new note body without
    scoring it. `force-rotate` and `bulk-qr` refuse notes.
  - GET list/detail return `entryType`. Bulk import and workspace sync
    explicitly create `LOGIN`.
- `routes/misc.ts`: `/health/scores` lists only logins, and
  `/health/check/:id` returns 400 for notes. `routes/directory.ts` health
  distribution counts logins only. `routes/collections.ts` returns
  `entryType`.
- Frontend:
  - `lib/entryTypes.js` (new): label, icon (KeyRound / StickyNote),
    secretLabel, multiline, and `EntryTypeIcon`.
  - `AddEntryModal`: Login / Secure Note toggle. A note uses a textarea
    and hides username, rotation, SSO, generator and QR.
  - `EditEntryModal`: type is read-only and shown in the header. Note
    edits use a textarea.
  - `RevealPassword`: new `entryType` prop. Notes reveal as a scrollable,
    multi-line block with Copy, a timer and Done.
  - `Vault.jsx`: type icon on tiles (top-left, after the bulk checkbox),
    in the detail header and on favorites. New "All Types / Login /
    Secure Note" filter. Notes hide the health pill, username and Force
    Rotate, and are excluded from Avg Health, Weak Passwords and QR-pending.
  - `Collections.jsx` / `ManagerCollections.jsx`: no health pill on notes.

## Notes / gotchas
- Notes are stored with `healthScore 100 / STRONG` (neutral) rather than
  under a new HealthLabel value. Health views filter by `entryType`, not by
  label.
- Reveal is unchanged: the note body comes back as `password`, so
  grant/scope/clearance/audit work identically.
- Verified with `prisma generate` and `tsc --noEmit`. The frontend still
  needs testing on Windows: create a note (no username or health pill,
  note icon, multi-line reveal) and check that existing entries show the
  Login icon.
