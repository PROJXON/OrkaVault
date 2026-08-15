# Fix: revealed password/OTP/QR stuck on the previously selected account
Date: 2026-07-28

## Why
Revealing a password (or OTP/QR) for one vault entry, then clicking a
different entry in the catalog, left the middle pane showing the
*previous* entry's revealed secret and reveal-timer state instead of
resetting for the newly selected account.

## What changed
- `frontend/src/pages/Vault.jsx`: `RevealPassword`, `RevealOtp`, and
  `AdminQrModal` were rendered with `accountId={selected.id}` as a prop
  but no `key`. Since these components hold their own internal
  reveal/timer state (`phase`, `password`/`otp`, `screenTimeLeft`, etc.
  in `RevealPassword.jsx`/`RevealOtp.jsx`), and React only remounts a
  component (resetting its state) when its `key` changes — not when an
  arbitrary prop changes — switching the selected account reused the
  same component instance with its stale "revealed" state still intact.
  Added `key={selected.id}` to all three, forcing React to unmount the
  old instance (running its timer-cleanup effect) and mount a fresh one
  whenever the selected account changes.
- No backend change needed; purely a frontend state-lifecycle bug.
