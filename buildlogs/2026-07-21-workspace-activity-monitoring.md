# Google Workspace login/OAuth-grant monitoring (Phase 2)
Date: 2026-07-21

## Why
`docs/google-workspace-admin-sdk-monitoring.md` and
`docs/rollout-plan-workspace-and-alerts.md` (Phase 2) proposed ingesting
Google Workspace Admin SDK Reports API activity (logins, OAuth token
grants) so admins can see suspicious logins / new third-party app
connections for OrkaVault users without polling the Admin Console by
hand. Runs independently of Phase 1 (chat alerts, already shipped) but
reuses its webhook plumbing for notifications.

Decisions from the user for this phase's previously-open questions:
- Workspace edition unconfirmed (Business Starter/Standard or unsure) —
  built against the documented API contract; edition-specific data gaps
  are something to find out once real polling starts, not a code
  concern.
- Domain-wide delegation service account not set up yet — built with an
  explicit "not configured" guard (`isWorkspaceMonitoringConfigured()`),
  same shape as `secretManager.ts`/`kms.ts`'s dev fallbacks. No crash, no
  synthetic data; the cron just logs once and returns until it's wired up.
- Scope: all Workspace users org-wide, not filtered to AccessGrant
  holders.
- Alert triggers: Google's suspicious-login flag, new OAuth app grants,
  and logins outside an allow-listed IP/country range — but every
  login/token event is stored regardless, so admins can browse full
  history even when nothing was flagged.

## What changed
- `backend/prisma/schema.prisma`: new `WorkspaceActivityEvent` model;
  3 new `NotifType` values (`WORKSPACE_SUSPICIOUS_LOGIN`,
  `WORKSPACE_NEW_OAUTH_APP`, `WORKSPACE_LOGIN_ALLOWLIST_VIOLATION`).
- `backend/src/services/googleWorkspace.ts`: new service —
  `isWorkspaceMonitoringConfigured()`, `fetchActivitySince()` (Reports API
  `activities.list` for "login"/"token"), `evaluateAlert()` (the three
  trigger rules), `ingestWorkspaceActivity()` (cron entry point: persist +
  dedup + notify on flagged events via `notifyAdmins` and
  `sendChatAlert`).
- `backend/src/services/webhookAlerts.ts`: extended `ChatAlertEvent`/
  `ChatAlertPayload` with the three `WORKSPACE_*` events, an optional
  `detail` field, and a generic `link` override (was hardcoded to
  `/approvals`; workspace alerts link to `/workspace-activity`).
- `backend/src/routes/workspaceActivity.ts`: new route,
  `GET /api/workspace-activity` [ADMIN], filters `eventType`/`userEmail`/
  `flagged`/`limit`.
- `backend/src/index.ts`: mounts the new route; runs
  `ingestWorkspaceActivity()` on startup + every 30 min (Google's Reports
  API has multi-hour ingestion lag — polling faster doesn't help).
- `frontend/src/pages/Settings.jsx`: Alerts tab gets two more fields,
  `WORKSPACE_ALLOWED_IPS` / `WORKSPACE_ALLOWED_COUNTRIES` (comma-separated
  allow-lists, blank = that check disabled).
- `frontend/src/pages/WorkspaceActivity.jsx`: new ADMIN page, modeled on
  `Audit.jsx` (filter bar + table). Wired into `App.jsx`
  (`/workspace-activity`, ADMIN-only `ProtectedRoute`) and `Sidebar.jsx`.
- `backend/.gitignore`: added `local_workspace_sa_key.json`.
- `ARCHITECTURE.md`: added the new model, service, cron, route, and page
  to their respective tables/sections.

## Notes / gotchas

- Step-by-step credential setup (GCP service account, domain-wide
  delegation, Workspace Admin Console authorization) is now written up in
  `docs/google-workspace-service-account-setup.md` — follow that when
  ready to actually activate this feature.
- **This feature is inert until manually activated.** It needs: (1) a GCP
  service account with domain-wide delegation, set up in the Workspace
  Admin Console by a super-admin (not something doable from this repo);
  (2) `GOOGLE_WORKSPACE_ADMIN_EMAIL` env var set to the super-admin's
  email being impersonated; (3) the service account's JSON key saved to
  `backend/local_workspace_sa_key.json` (gitignored — path overridable via
  `GOOGLE_WORKSPACE_SA_KEY_PATH`). Until all three exist,
  `ingestWorkspaceActivity()` no-ops (logs once on startup, not every
  30-min tick).
- After pulling this change, run `npm run prisma:db` in `backend/` to
  apply the schema change to a real Postgres instance — this sandbox has
  no Postgres running, so it hasn't been applied or tested against a live
  DB. `npx prisma generate` (schema-only, no DB needed) was run to
  regenerate the Prisma client and confirm `npx tsc --noEmit` passes.
- Country-based allow-list matching is best-effort: Google's login event
  payload doesn't reliably expose a plain country field across every
  Workspace edition/event type. IP-based matching is the reliable
  mechanism; the country check only fires when the raw event actually
  has a usable field, and silently no-ops otherwise. Revisit once real
  event data is available to confirm what Google actually sends for this
  tenant's edition.
- IP allow-list matching is exact-match/prefix-string only, not real CIDR
  range math — a `10.0.0.0/24`-style range wasn't implemented since there
  was no real IP data yet to validate the matching logic against. Worth
  upgrading to a proper CIDR check once the service account is live and
  this is actually being exercised.
- No new webhook-URL config needed — workspace alerts ride the same
  Discord/Google Chat webhooks configured in Phase 1
  (`docs/rollout-plan-workspace-and-alerts.md` explicitly recommends this
  over a second channel).
- Follow-up, explicitly out of scope here (per the design doc): cross-
  referencing a flagged Workspace event with the user's `AccessGrant`s
  into a single risk view. Land raw data first, decide if correlation is
  worth building once there's real event data to look at.
- Phase 3 (inbound Discord/Google Chat bot commands) is next, per
  `docs/rollout-plan-workspace-and-alerts.md`.
