# Bulk CSV Import for Vault Entries
Date: 2026-07-21

## Why
Admins onboarding many credentials at once (e.g. migrating from a
spreadsheet) had to add each Account one at a time through `AddEntryModal`.
User requested a bulk CSV import, plus a downloadable template.

## What changed
- `backend/src/services/csvImport.ts` (new): dependency-free CSV parser
  (quoted fields, embedded commas/newlines) — the import format is small
  and fixed, so this avoids adding a package for it.
- `backend/src/routes/accounts.ts`: added `POST /api/accounts/bulk-import`
  (ADMIN only, matches the existing single `POST /` enforcement). Multer
  with `memoryStorage` (2MB cap, .csv only) — the file is parsed and
  discarded, never written to disk, since it carries plaintext passwords
  the same way the single-entry JSON body does. Rows are processed
  sequentially (not one DB transaction) so a bad row doesn't abort the
  batch; response is `{ created, failed, results: [{row, name, status,
  error?, id?, qrPending?}] }`. Reuses the duplicate-check / password
  hashing+scoring / rotation-schedule / audit-log logic from the single
  create path. Capped at 500 rows.
- `backend/src/routes/accounts.ts`: added `isTotpQrRequired()` reading a
  new `REQUIRE_TOTP_QR` `OrganizationPolicy` row (default: required, i.e.
  today's behavior), and enforced it server-side in `POST /` and
  `PATCH /:id` — this was previously **only** checked in the frontend
  modals, a real gap per the project's server-side-enforcement rule.
- GOOGLE_WORKSPACE rows in a CSV can't carry a TOTP QR image, so
  bulk-import always creates them without one regardless of the policy
  toggle, and prepends `[QR PENDING] ...` to the account's `notes` so
  admins know to attach the QR later via `EditEntryModal`.
- `frontend/src/components/BulkImportModal.jsx` (new): file picker +
  "Download CSV template" (generates the same CSV client-side as the
  repo template) + per-row results summary (created/failed/QR-pending).
- `frontend/src/pages/Vault.jsx`: "Bulk Import" button next to "Add
  Entry" (ADMIN only), wired to the new modal.
- `frontend/src/pages/Settings.jsx`: added a toggle for
  `REQUIRE_TOTP_QR` ("Require Authenticator QR Code for Google
  Workspace"), saved through the existing `/policies/bulk` endpoint.
- `frontend/src/components/AddEntryModal.jsx` /
  `EditEntryModal.jsx`: fetch the policy on open and only enforce the
  QR-required validation when it's not explicitly `"false"`.
- `templates/vault-entries-template.csv` (new, repo root): example rows
  covering THIRD_PARTY, FINANCE, and a QR-less GOOGLE_WORKSPACE row.
  Byte-identical to the modal's client-generated download.
- `ARCHITECTURE.md`: added `bulk-import` to the accounts route table,
  `csvImport.ts` to the services table, `BulkImportModal.jsx` to the
  notable-components list.

## Update (same day)
- `backend/src/routes/accounts.ts`: `collection` in the CSV now
  auto-creates a `Collection` by that name (case-insensitive lookup
  first, `create` if not found) instead of failing the row. Wrapped in a
  try/catch that re-queries on failure (handles a same-name create race
  between two rows/requests hitting the unique constraint on
  `Collection.name`) so a race fails only that row, not the whole batch.
  No new privilege implied — this route is already ADMIN-only, and ADMINs
  can already create Collections directly via `POST /api/collections`.
- `backend/src/routes/accounts.ts`: fixed the response status when every
  row in an import fails — it was `400`, which made axios reject the
  request and drop the `results` array in the frontend's `catch` branch
  before the per-row error reasons ever reached the UI (user just saw the
  generic "Failed to import CSV." fallback). Now always `200`/`201`: the
  request itself was valid and fully processed, row-level failure is
  data returned to render, not an HTTP-level client error. Caught via a
  real user report of a generic "Failed to import" toast with no
  visible reason.
- Removed `FINANCE` from bulk-import's accepted `platformType` values
  and from the template CSV (`templates/vault-entries-template.csv` and
  the matching constant in `BulkImportModal.jsx`). It's a pre-existing
  `PlatformType` enum value in `schema.prisma` that was never wired into
  `AddEntryModal`/`EditEntryModal`'s dropdown, so it was possible to
  bulk-import an account of a type nothing else in the app can display
  or edit correctly. Left the schema enum itself alone — not removing a
  data-model value unasked.

## Notes / gotchas
- CSV columns: `name,username,platformType,password,isGoogleSSO,
  refreshCycle,notes,collection`. `collection` is looked up by name
  (case-insensitive), auto-created if it doesn't exist yet (see Update
  above).
- `EditEntryModal`'s QR check previously forced a re-upload on *every*
  edit of a GOOGLE_WORKSPACE account (it always starts `totpQrBase64`
  blank, and the backend never validated, so nothing enforced keeping the
  existing image). Fixed as a side effect of adding server-side
  enforcement: `PATCH /:id` now checks the account's stored
  `totpQrBase64` when the request doesn't send a new one, instead of
  treating "no image in this request" as "no image at all."
- Verified with `npx tsc --noEmit` in `backend/` (clean) and a standalone
  `csvImport.ts` run against the template file (parses as expected). Did
  not exercise the route end-to-end — this environment's Postgres/dev
  server wasn't available to test against, and `frontend/node_modules`
  has a platform mismatch (Windows binaries for rollup/esbuild on this
  Linux box) that blocks `vite build` independent of this change, so the
  frontend changes were verified by careful manual review only, not a
  running build.

## Update: bulk QR follow-up (same day)
User asked for the fastest way to attach TOTP QR codes to the
GOOGLE_WORKSPACE accounts flagged `[QR PENDING]` by an import, without
opening `EditEntryModal` once per account.

- `backend/src/routes/accounts.ts`: added `PATCH /api/accounts/bulk-qr`
  (ADMIN only). Body: `{ updates: [{ accountId, totpQrBase64 }, ...] }`
  — same base64-data-URI-in-JSON shape `EditEntryModal` already uses for
  a single QR upload, so no multipart/multer needed here. Per-account
  try/catch (one bad id doesn't fail the batch), capped at
  `MAX_IMPORT_ROWS` (500) same as bulk-import. On success it also strips
  the `QR_PENDING_NOTE_PREFIX` marker back off `notes` (extracted that
  literal into a shared constant, previously inlined in bulk-import) so
  the account's notes go back to whatever the admin actually wrote.
- `frontend/src/components/BulkImportModal.jsx`: the post-import
  QR-pending list is no longer a static bullet list — each row now has
  its own inline file input (reads to base64 via `FileReader`, same
  pattern as `AddEntryModal`/`EditEntryModal`), and one "Save QR Codes"
  button PATCHes all staged ones in a single request. Rows flip to a
  green "Saved" state on success instead of disappearing, so the admin
  can see what's left without losing context.
- `ARCHITECTURE.md`: added `/bulk-qr` to the accounts route table and a
  note on `BulkImportModal.jsx`.

### Notes / gotchas
- No filename-based auto-matching — each file is manually assigned to its
  row via the row's own input, avoiding any risk of a QR ending up
  attached to the wrong account.

## Update: persistent QR-pending view (same day)
Closing `BulkImportModal` before finishing QR uploads meant losing that
list — user asked for a way to get back to it without re-importing.

- `frontend/src/components/QrUploadList.jsx` (new): extracted the
  per-row file-input + "Save QR Codes" list out of `BulkImportModal.jsx`
  into its own component (`{accounts: [{id, name}], onSaved}`) so it can
  be reused instead of duplicated.
- `frontend/src/components/QrPendingModal.jsx` (new): standalone modal
  listing every pending account and rendering `QrUploadList` against it.
  Opened from a "QR Codes Pending (N)" button in `Vault.jsx` (ADMIN only,
  shown only when N > 0), next to Bulk Import/Add Entry.
- `frontend/src/pages/Vault.jsx`: computes the pending list client-side
  from the accounts already loaded for the page —
  `platformType === "GOOGLE_WORKSPACE" && !isGoogleSSO && !hasTotpQr` —
  no new GET endpoint needed, `GET /api/accounts` already returns
  `hasTotpQr`/`isGoogleSSO`/`platformType` per account.
- `backend/src/routes/accounts.ts` / `BulkImportModal.jsx`: unchanged
  behavior, but worth noting the "pending" signal used here is
  structural (missing `totpQrBase64`), not the `[QR PENDING]` notes-text
  marker bulk-import writes. The notes marker is a human-readable hint
  left in place for context; this view is the ground truth and also
  catches GOOGLE_WORKSPACE accounts created individually while
  `REQUIRE_TOTP_QR` was toggled off (bulk-import isn't the only path to
  a QR-less account).

### Notes / gotchas
- `QrUploadList`'s save button calls the parent's `onSaved`/`onSuccess`
  (`Vault.jsx`'s `fetchAccounts`), so the persistent button's count and
  `QrPendingModal`'s list both shrink live off the same refetch — no
  separate polling or duplicate state to keep in sync.

## Update: JSON body size limit for /api/accounts (same day)
Found while walking through upload-safety questions: `express.json()` in
`backend/src/index.ts` used the library default 100KB limit with no
override anywhere. A single QR *screenshot* (vs. a tightly cropped image)
can exceed that on its own, and `PATCH /api/accounts/bulk-qr` sends
several base64 images in one JSON array — a handful together reliably
blow past 100KB and get 413'd by body-parser before ever reaching the
route (confusing failure, not a security issue on its own).

- `backend/src/index.ts`: added `app.use("/api/accounts",
  express.json({ limit: "10mb" }))` before the existing global
  `express.json()`. Scoped to this path only, rather than raising the
  limit for every route — auth/users/etc. don't need bigger bodies.
  Confirmed safe to stack two `express.json()` calls on the same
  request: body-parser sets `req._body = true` after parsing and
  short-circuits on a second pass (`node_modules/body-parser/lib/types/
  json.js:102`), so the global one downstream is a no-op for this path.
