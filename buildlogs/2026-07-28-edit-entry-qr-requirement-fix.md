# Fix: editing an account no longer forces a QR re-upload
Date: 2026-07-28

## Why
Changing just the password (or any other field) on an existing Google
Workspace vault entry forced re-uploading its Authenticator QR code
every time, even though the account already had one on file. The user
wanted the existing QR preserved unless they explicitly choose to
replace it.

## What changed
- `frontend/src/components/EditEntryModal.jsx`: the submit guard and the
  QR field's "(Required)" label both checked
  `!formData.totpQrBase64` — but that form field always starts blank on
  open ("only sent if changed"), so it was indistinguishable from "this
  account has no QR at all." Both now also check `!account.hasTotpQr`
  (the same server-computed flag already used elsewhere in `Vault.jsx`),
  so a QR is only required when the account genuinely doesn't have one
  yet. Added a small "Existing QR code on file — will be kept" hint when
  no new file is selected, so it's clear at a glance nothing will be
  lost by leaving the field blank.
- No backend change needed — `PATCH /api/accounts/:id`
  (`routes/accounts.ts`) already correctly falls back to the existing
  `account.totpQrBase64` when the field is omitted from the request; the
  bug was entirely in the frontend's client-side guard being stricter
  than the backend's actual requirement.
