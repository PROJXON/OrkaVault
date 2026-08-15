# Workspace Activity fixes + Device inventory
Date: 2026-07-28

## Why
Users reported the Activity Log's App column showed unclear raw OAuth
client IDs and caused horizontal scroll, and the Flagged column added no
value. Investigating the app-name bug led to fixing the wrong own-service-
account noise filter (a real regression that briefly broke all ingestion),
and to the discovery that per-event device/browser data doesn't exist for
`login`/`token` Reports API events at all — device data needed a separate
Cloud Identity Devices API integration instead.

## What changed
- `backend/src/services/googleWorkspace.ts`:
  - Fixed `appName` parsing: correct parameter key is `app_name`, not the
    previous (wrong) `application_name`; added a `ConnectedApp`-table
    fallback for grants Google genuinely has no name for.
  - `paramValue()` now also reads `intValue` (our own service account's
    bare-numeric `client_id` was landing there, not `value`).
  - `isOwnPollingNoise()` replaces the old exact-appName-match filter:
    primary check is exact `clientId` match on `getOwnClientId()`,
    fallback is any `oauth_token_grant` on `ADMIN_EMAIL` with a
    bare-numeric `client_id` (real third-party apps always have a dotted
    `.apps.googleusercontent.com` id).
  - The `ConnectedApp` name-lookup fallback is now isolated in its own
    try/catch — it had been sitting unguarded before the main event loop
    and could abort ingestion of every event (including logins) if it
    ever threw. This was a real regression introduced and then fixed in
    this session.
  - Added `networkInfo.regionCode`/`subdivisionCode` (approximate
    location) to ingested events — confirmed working against real data.
  - Removed `userDeviceInfo` device fields from event ingestion entirely
    — confirmed via Google's own field-coverage changelog that this field
    is not populated for `login`/`token` events under any circumstances,
    regardless of device enrollment.
  - Added a **Cloud Identity Devices API** integration (a different
    API/credential requirement than the rest of this file — needed the
    full `cloud-identity.devices` scope; `.readonly` was rejected even
    though only `.list()` is ever called, since domain-wide delegation
    authorization matches scope strings exactly, not by permission
    hierarchy). `fetchDevicesById()`/`fetchDeviceUserAssociations()` are
    shared helpers (optional `filter` param) behind two entry points:
    `fetchWorkspaceDevices()` (full org sweep, background cron only) and
    `fetchWorkspaceDevicesForUser()` (filtered to one user via `email:` —
    the "Mobile device search fields" vocabulary, confirmed via Google's
    how-to guide — used for on-demand per-account syncs, since the full
    sweep is slow: `deviceUsers.list` caps at 20/page).
  - Fixed a real join bug in the above: `devices.list` and
    `devices.deviceUsers.list` were being joined on `Device.deviceId` (an
    explicit field) vs. an ID parsed from `DeviceUser.name`'s resource
    path — two different identifiers that don't reliably match. Every
    join silently missed, so Device-sourced fields (type/model/OS) came
    back null while DeviceUser-sourced fields (`managementState`) were
    fine. Now both sides join on the resource-name path segment
    (`deviceResourceId()`) consistently.
  - Added `describeGoogleApiError()` — gaxios/googleapis errors default to
    a useless top-level message; the real reason lives in
    `error.response.data.error`, which plain `console.error(error)`
    doesn't surface. Used in the Workspace Devices sync catch block.
  - Added `inferLikelyDevice()` — a best-effort, explicitly
    non-authoritative guess at which device a login came from: closest
    `WorkspaceDevice.lastSyncTime` for that user. Built because Google's
    Reports API login/token events carry no device reference of any kind
    to join against (verified three separate times against the live docs
    in this session, including a specific check for a `device_id`
    parameter the user proposed — genuinely doesn't exist on these two
    event types). Wired into `GET /api/workspace-activity`, attached only
    to login-type rows (not token grants — those are often a third-party
    app's own server, not the user's device) via `inferredDevice`, read
    from already-synced DB data only, no live Google calls in that route.
- `backend/prisma/schema.prisma`: removed `WorkspaceActivityEvent.deviceType`/
  `deviceOsVersion`; added `regionCode`/`subdivisionCode`; added new
  `WorkspaceDevice` model.
- `backend/src/routes/workspaceActivity.ts`: added `GET /devices`,
  `GET /devices/users` (fast, DB-backed — mirrors `/connected-apps/users`),
  `POST /devices/sync` (full org, slow, manual escape hatch), and
  `POST /devices/sync/:userEmail` (on-demand per-account, filtered calls).
  `GET /` now attaches `inferredDevice` to login rows.
- `backend/src/index.ts`: registered `syncWorkspaceDevices` cron (6h,
  same cadence as `syncConnectedApps`).
- `frontend/src/pages/WorkspaceActivity.jsx`:
  - Activity Log tab: removed the Flagged column (kept the filter),
    switched from a table to tile/card layout at all breakpoints (a table
    kept forcing horizontal scroll as columns were added), added Location
    and "Likely Device" (inferred, login rows only) fields, removed the
    (dead) Device field.
  - Unverified/unnamed apps now render as "Unverified app (shortId)"
    instead of the raw client ID string.
  - New "Devices" tab: fast list of accounts + last-known device count
    (from DB), click an account to sync + expand its device list on
    demand — mirrors `ConnectedAppsTab`'s pattern, not the initial
    full-org-sync-on-load design (too slow for this API's pagination
    limits).
  - `formatInferredDevice()` now shows `model`/`osVersion` alongside the
    device type (e.g. "Windows · Latitude 5420 · 10.0.19045") instead of
    just "Windows" — the backend was already returning both, this was a
    display-only gap.

## Notes / gotchas
- Needs `npx prisma db push` run in the real environment for the schema
  changes (new `WorkspaceDevice` model, changed `WorkspaceActivityEvent`
  columns) — sandbox has no DB, could not run/verify this directly.
- `WorkspaceDevice` is a snapshot; `inferredDevice` on login rows is a
  computed guess, not real correlation — Google gives us nothing to
  authoritatively join a login to a device. Don't build anything downstream
  (alerts, audit conclusions) that treats `inferredDevice` as fact.
- Desktop devices only appear in `WorkspaceDevice` if Endpoint
  Verification, GCPW, or Google Drive for Desktop is installed. Mobile
  (Android/iOS) is usually automatic. If Devices tab stays empty, check
  that first before assuming a bug.
- If Cloud Identity calls ever start failing again, check
  `[WorkspaceDevices]` logs first (now via `describeGoogleApiError()`, so
  the actual Google error reason is visible) before assuming code
  regression — the domain-wide delegation scope-string requirement above
  bit us once already.
- **Open/deferred**: model + OS version can still fail to disambiguate two
  *identical* company-issued machines for the same user (same model, same
  OS build). Offered adding `WorkspaceDevice.hostname` (Google's Device
  resource already has it, just not stored/fetched yet — a small addition
  to `fetchDevicesById()`, the schema, and `InferredDevice`) as a further
  disambiguator. User hadn't confirmed whether they want this before the
  session ended — ask before building it, don't assume yes.
