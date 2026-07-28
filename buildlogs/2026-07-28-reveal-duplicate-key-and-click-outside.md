# Fix: duplicate React keys re-broke reveal state; add click-outside-to-hide
Date: 2026-07-28

## Why
The earlier same-day fix ([[2026-07-28-reveal-stale-state-fix]]) added
`key={selected.id}` to `RevealOtp`, `RevealPassword`, and `AdminQrModal`
to force a remount when the selected vault entry changes. But all three
siblings got the *same* key value (`selected.id`). Duplicate keys among
sibling elements break React's keyed reconciliation (the map it builds
from old children collapses to one entry per key), so switching entries
could leave a stale instance un-unmounted while a new one mounted
alongside it — exactly the "still shows the old entry's secret and
starts sprouting extra OTP buttons" glitch reported.

Also requested: clicking outside a revealed password/OTP pill should
hide it automatically, on top of the existing "Done" checkmark button.

## What changed
- `frontend/src/pages/Vault.jsx`: gave each sibling a unique, role-prefixed
  key (`otp-${selected.id}`, `pw-${selected.id}`, `qr-${selected.id}`)
  instead of sharing `selected.id`.
- `frontend/src/components/RevealPassword.jsx` and `RevealOtp.jsx`: added
  a `containerRef` on the revealed-state wrapper div(s) and a
  `mousedown` document listener (active only while `phase === "revealed"`)
  that calls the existing `handleDone()` when the click lands outside the
  pill. Removed on unmount/phase change.
- No backend change; purely frontend state-lifecycle + UX.
