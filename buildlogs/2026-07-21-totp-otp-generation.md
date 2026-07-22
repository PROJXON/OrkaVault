# Generate OTPs from uploaded QR codes instead of showing the QR image
Date: 2026-07-21

## Why
The "reveal QR code" flow just handed back the raw uploaded authenticator
QR image to anyone with access to the account, same trust level as
revealing the password. Asked to have the app actually read the QR code
and compute the OTP itself, so day-to-day access only ever needs the
rotating 6-digit code — the underlying QR/secret becomes an admin-only
concern (re-provisioning a new device), not something every grantee sees.

## What changed
- `backend/package.json`: added `otplib` (TOTP generation/otpauth
  parsing), `jsqr` + `jimp` (server-side QR image decoding, pure JS, no
  native deps).
- `backend/src/services/totp.ts` (new): `decodeQrImage` (jimp → jsqr),
  `extractTotpSecret` (pulls `secret` off an `otpauth://totp/...` URI),
  `validateTotpQrImage` (throws if an uploaded image isn't a real TOTP QR
  code — this is new; previously *any* image was accepted with zero
  validation), `generateOtpFromQrImage` (decode + `otplib.generate` +
  seconds-until-rotation). Storage is unchanged — `Account.totpQrBase64`
  still holds the uploaded image; it's decoded on demand, not migrated to
  a new field, since we don't need to keep the QR around for anything
  except admin re-provisioning.
- `backend/src/routes/accounts.ts`:
  - `POST /`, `PATCH /:id`, `PATCH /bulk-qr` now call
    `validateTotpQrImage` on any uploaded QR before storing it, rejecting
    unreadable/non-TOTP images with a clear error instead of silently
    accepting them.
  - `POST /:id/reveal-qr` is now **ADMIN only** and unchanged otherwise
    (still returns the raw stored image) — this is the "only admins can
    view the QR code" part of the ask.
  - `POST /:id/reveal-otp` (new) — same grant/clearance/collection-scope
    gating the old reveal-qr had for non-admins, but decodes the stored
    image and returns `{ otp, secondsRemaining, expiresIn,
    grantExpiresAt }` instead of the image. New `OTP_REVEALED` audit
    action (`QR_CODE_REVEALED` is now specifically the admin raw-image
    reveal).
- `frontend/src/components/RevealOtp.jsx` (new, replaces
  `RevealQrCode.jsx`): same reveal-button/screen-timer/grant-timer shape
  as `RevealPassword.jsx`, showing the current OTP as a spaced 6-digit
  code with its own rotation countdown. Since the code rotates every 30s
  independent of the (up to 90s) screen timer, it silently re-fetches a
  fresh code from `reveal-otp` each time the current one rotates, without
  the user re-clicking, until the screen/grant timer ends the reveal.
- `frontend/src/components/AdminQrModal.jsx` (new): small ADMIN-only
  button + modal that calls the now-admin-only `reveal-qr` and shows the
  raw QR image, for re-provisioning a device.
- `frontend/src/pages/Vault.jsx`, `ManagerCollections.jsx`: swapped
  `RevealQrCode` for `RevealOtp`; `Vault.jsx`'s workspace pane also shows
  `AdminQrModal` next to it, but only when `user.role === "ADMIN"`.
- `ARCHITECTURE.md`: route table, MANAGER-scope-check note, and
  clearance-check note updated (`reveal-qr` → `reveal-otp` as the one
  those helpers gate); added `totp.ts` to the services table; updated the
  `RevealQrCode.jsx` mention in Notable components.

## Notes / gotchas
- Verified the actual decode/generate pipeline end-to-end (not just
  reasoning from docs): a throwaway script generated a TOTP secret, built
  a QR image for it with the `qrcode` npm package, decoded it back with
  `jimp`+`jsqr`, extracted the secret, generated a token with `otplib`,
  and confirmed it validates against the original secret. `qrcode` itself
  is **not** a dependency of the app — it was only installed locally
  (`--no-save`) to generate a test QR image and isn't needed in
  production, since we never generate QR images, only decode them.
  Backend also passes a full `tsc --noEmit` type-check with no errors.
  Frontend components were confirmed to transform cleanly through Vite.
  No browser tool or local Postgres in this sandbox, so I couldn't
  click through an actual reveal in the running app — worth doing once
  you're set up locally, especially the silent 30s-rotation refresh.
- This sandbox's node_modules sits on a VirtualBox shared folder that
  doesn't support atomic rename reliably (same root cause as the
  filesystem note in CLAUDE.md) — several `npm install` runs here
  corrupted unrelated already-installed packages (ts-node, typescript,
  mime) mid-rename. Repaired by re-extracting each via `npm pack` +
  manual `tar` instead of relying on npm's own install-time rename. Not
  expected to be an issue in a normal dev environment; flagging in case
  `npm install` ever misbehaves similarly for you on this same mount.
- `Account.totpQrBase64` (the raw uploaded image, unencrypted in
  Postgres) is unchanged by this work — pre-existing, and out of scope
  here since the ask was about the *reveal* flow, not storage. Worth a
  separate look if you want it moved through `secretManager.ts` like
  passwords are (would need a schema migration + backfill of existing
  accounts, which I did not want to take on silently as a side effect of
  this change).
