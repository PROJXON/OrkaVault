# Custom fields on vault entries

Phase 2 of `plan/` (NEW.md requests). **Schema change — migration must be
applied locally** (`npm run prisma:migrate` or `npx prisma migrate deploy`
in `backend/`).

## Why
Users wanted to add their own fields to a vault entry (PINs, recovery
codes, security answers). Once saved, each value shows as `••••••••` with a
**Copy** button (copies without showing) and an **Eye** button (shows it
for a short time).

## What changed
- `backend/prisma/schema.prisma` + `migrations/20261022120000_account_custom_fields/`:
  new `AccountCustomField` (label, position) and `Account.customFieldsSecretRef`.
- `backend/src/services/customFields.ts` (new): validate / save / read / delete.
  All of an account's values are stored as one JSON blob through
  `secretManager`, never as plaintext in Postgres. A field with an existing
  `id` and a null value keeps its stored value.
- `backend/src/routes/accounts.ts`: create/PATCH accept `customFields`.
  GET list/detail return labels only. `POST /:id/reveal` also returns the
  values, so they pass the same grant, manager-scope, clearance and audit
  checks as the password. Delete and bulk-delete also delete the blob.
  Audit metadata records labels only, never values. The PATCH response no
  longer includes `customFieldsSecretRef`, `passwordHash` or `totpQrBase64`.
- `frontend/src/lib/useAccountReveal.js` (new): one reveal session shared by
  the password and every field, so a single reveal call, audit entry and
  90s window covers all of them.
- `RevealPassword.jsx`: moved onto the hook, with an optional shared `reveal`
  prop. It looks and behaves the same as before.
- `CustomFieldRow.jsx`, `CustomFieldsEditor.jsx` (new); `Vault.jsx`,
  `AddEntryModal.jsx`, `EditEntryModal.jsx` wired up. The Notes placeholder
  no longer suggests putting backup codes in plaintext notes.

## Notes / gotchas
- Local-mode `secretRef`s are the ciphertext itself (`ENC_…`), so
  `customFieldsSecretRef` must never be serialized. That's why there's a
  label-only `select` on the GET routes.
- The secret is written before the DB rows. GCP refs are pinned versions,
  so if the DB write fails the old ref still resolves.
- Copy doesn't clear the clipboard afterwards, which matches the existing
  password copy.
- Out of scope: custom fields in CSV bulk import and in workspace sync.
- Verified with `tsc --noEmit` and a JSX parse check. Needs an end-to-end
  test on Windows.
