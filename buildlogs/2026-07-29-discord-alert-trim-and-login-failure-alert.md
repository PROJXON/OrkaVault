# Trim Discord/GChat Workspace alerts, add dedicated login-failure alert
Date: 2026-07-29

## Why
The Discord channel was getting flooded by `WORKSPACE_NEW_OAUTH_APP` chat
alerts (one per OAuth grant, which happens often). User wants the chat
integration limited to: access-request approve/deny, suspicious-login,
allow-list-violation (kept as-is), and a new dedicated "login failure"
alert — the last one should always fire (not gated on the IP/country
allow-list) and should include the location + heuristic device-match info
already shown on the Activity Log page.

## What changed
- `backend/prisma/schema.prisma`: added `WORKSPACE_LOGIN_FAILURE` to the
  `NotifType` enum. Needs `npx prisma generate` (done) and, once a DB is
  reachable, `npx prisma db push`.
- `backend/src/services/googleWorkspace.ts`:
  - `evaluateAlert()`: `login_failure` is now its own unconditional branch
    (fires regardless of allow-list config) that looks up the user's
    `WorkspaceDevice` rows, runs the existing `inferLikelyDevice()` guess,
    and builds a `detail` string with IP, location (regionCode/
    subdivisionCode), and the inferred device label.
  - Added `formatLocationForAlert`/`formatInferredDeviceForAlert`/
    `formatGapForAlert`/`DEVICE_TYPE_LABELS_FOR_ALERT` — plain-text mirrors
    of the equivalent formatting helpers in
    `frontend/src/pages/WorkspaceActivity.jsx`, so the chat message reads
    consistently with the Activity Log UI.
  - `CHAT_EVENT_BY_NOTIF`: dropped `WORKSPACE_NEW_OAUTH_APP`, added
    `WORKSPACE_LOGIN_FAILURE`. OAuth-grant events are still persisted and
    still flagged in-app (`notifyAdmins`) — only the outbound chat alert
    was removed.
- `backend/src/services/webhookAlerts.ts`: `ChatAlertEvent` swapped
  `WORKSPACE_NEW_OAUTH_APP` for `WORKSPACE_LOGIN_FAILURE`; added its title/
  description/color.

## Notes / gotchas
- A login failure that also happens to violate the IP/country allow-list
  now only produces the richer `WORKSPACE_LOGIN_FAILURE` alert, not an
  additional `WORKSPACE_LOGIN_ALLOWLIST_VIOLATION` one — `login_success`
  is the only case left going through the allow-list-violation branch.
- Device-match lookup runs one `WorkspaceDevice.findMany` per failure
  event; not batched/cached across a single ingest run since failures are
  expected to be infrequent (that's the point of this change).
- Could not run this end-to-end (no Postgres in this sandbox, no live
  Discord webhook) — verified with `tsc --noEmit` only. User should
  confirm the Discord message formatting looks right after their next
  real failed login.
