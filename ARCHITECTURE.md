# OrkaVault Architecture Map

Purpose: let Claude jump straight to the right file instead of exploring.
Read this before grepping the tree. Update it when files/routes/models are
added, renamed, or removed (see CLAUDE.md for the update rule).

## 1. High-level shape

Monorepo, two apps, no shared package:

```
backend/    Express + TypeScript API, Prisma/PostgreSQL, JWT auth
frontend/   React 18 + Vite, also packaged as an Electron desktop app
```

Frontend talks to backend only over HTTP (`VITE_API_URL`, default
`http://localhost:5001/api`). No server-side rendering, no monorepo tool
(no Nx/Turborepo) — each app has its own `package.json`/lockfile and is
run independently.

Domain: internal credential vault. Users request time-limited or ongoing
access to shared Accounts (credentials); Managers/Admins approve; secrets
are never stored in Postgres, only references (see §4).

## 2. Backend (`backend/`)

```
src/index.ts              Entry point: express app, route mounting, 2 cron jobs
src/routes/                One router per resource, mounted in index.ts
src/middleware/
  auth.ts                  requireAuth (JWT + DB active-check), requireRole(...roles)
  errorHandler.ts          Last-mile error middleware
src/services/               Business logic used by routes, no HTTP here
src/scripts/                One-off/maintenance scripts run via ts-node, not imported by the app
src/utils/reqValue.ts       asString() — coerces req.params/req.query values (Express 5 types these
                            string | string[] | undefined; none of our routes repeat segments, so
                            it's always a single string at runtime)
src/lib/prismaClient.ts     The ONLY place PrismaClient is constructed — exports the shared `prisma`
                            singleton (+ re-exports enums/types from the generated client). Prisma 7
                            requires a driver adapter (PrismaPg) per instance, so every route/service/
                            script must `import { prisma } from "../lib/prismaClient"` instead of
                            constructing its own PrismaClient — otherwise each call site opens its own
                            connection pool.
src/generated/prisma/       Generated Prisma Client output (gitignored, regenerate with `npm run
                            prisma:generate`). Prisma 7's `prisma-client` generator no longer writes to
                            node_modules by default — see the `output` field in schema.prisma's
                            generator block.
prisma/schema.prisma        Source of truth for the data model. No `url`/`directUrl` in the datasource
                            block as of Prisma 7 — connection strings live in prisma.config.ts (CLI) and
                            src/lib/prismaClient.ts (app runtime, via DATABASE_URL + the driver adapter).
prisma.config.ts            CLI-only config (generate/db push/studio) — replaces the schema.prisma
                            datasource `url` for those commands as of Prisma 7.
```

### Route map (all mounted under `/api` in `src/index.ts`)

| Mount | File | Endpoints |
|---|---|---|
| `/api/auth` | `routes/auth.ts` | POST `/register`, `/login`, `/refresh`, `/google`, `/logout`, `/mfa/setup`, `/mfa/enable`, `/mfa/disable`, `/mfa/verify`; GET `/me`, `/setup-status`, `/mfa/devices`; DELETE `/mfa/devices/:id` |
| `/api/users` | `routes/users.ts` | GET `/`; PATCH `/:id/approve`, `/:id/decline`, `/:id/role`, `/:id/enddate`, `/:id`, `/me/notifications`, `/:id/profile`, `/:id/gap-extend`; POST `/:id`, `/bulk-delete`; DELETE `/:id`; PATCH/DELETE `/me/favorites/:accountId` — `bulk-delete` [ADMIN] deactivates multiple users + revokes grants in one call (same soft-delete semantics as `DELETE /:id`), writes one `AuditLog` row per user |
| `/api/accounts` | `routes/accounts.ts` | GET `/`, `/:id`; POST `/`, `/bulk-import`, `/:id/reveal`, `/:id/reveal-otp`, `/:id/reveal-qr`, `/:id/force-rotate`, `/bulk-delete`, `/sync-workspace`; PATCH `/:id/qa`, `/:id`, `/bulk-qr`; DELETE `/:id` — **largest route file**, holds reveal/rotation/QA/bulk-import logic. `reveal-qr` is **ADMIN only** (raw uploaded QR image, for re-provisioning); everyone else with access uses `reveal-otp` (computed 6-digit code, see `services/totp.ts`). `bulk-delete` [ADMIN] hard-deletes multiple accounts + their secrets (same semantics as `DELETE /:id`), writes one `AuditLog` row per account. `sync-workspace` [ADMIN] auto-creates a vault Account for every active Google Workspace user without one yet (`services/workspaceAccountSync.ts`) — create-only, never updates an existing entry; `isGoogleSSO: true`/`secretRef: "SSO_ONLY"` since these track access to each person's own Workspace login, not a shared password |
| `/api/requests` | `routes/requests.ts` | GET `/`, `/last-approved/:accountId`; POST `/`; PATCH `/:id/approve`, `/:id/deny` — access-request workflow |
| `/api/directory` | `routes/directory.ts` | GET `/` — org directory listing (admin) |
| `/api/profile` | `routes/profile.ts` | GET/PATCH `/me`, POST `/me/avatar`, PATCH `/password` |
| `/api/policies` | `routes/policies.ts` | GET `/`; POST `/`, `/bulk`; PATCH/DELETE `/:id` — org-wide policy config |
| `/api/collections` | `routes/collections.ts` | GET `/`; POST `/`; PATCH/DELETE `/:id` — groups of Accounts managers are scoped to. GET `/` includes `managers` (id/name/email) and `accounts` (id/name/username/platformType/healthLabel, the attached Accounts) on each Collection. PATCH `/:id` also accepts `managerIds` (sets `Collection.managers`) — reciprocal to `PATCH /api/users/:id/profile`'s `managedCollectionIds`, same relation editable from either side |
| `/api/departments` | `routes/departments.ts` | GET `/` (public — Register.jsx needs it pre-auth); POST `/`, PATCH/DELETE `/:id` [ADMIN] — configurable department name list (Settings → Departments tab). DELETE reassigns users to 'Unspecified' before deleting (requires confirmation), except when deleting 'Unspecified' itself which is blocked if in use. `User.department` stays free-text, not a relation — see model comment in `schema.prisma` |
| `/api/workspace-activity` | `routes/workspaceActivity.ts` | GET `/` [ADMIN] — ingested Google Workspace login/OAuth-grant events (`WorkspaceActivityEvent`), filters `eventType`/`userEmail`/`flagged`/`limit`. Populated by the `ingestWorkspaceActivity` cron in `index.ts`; empty until Workspace monitoring is configured (see `services/googleWorkspace.ts`). Login-type rows (`login_success`/`login_failure`/`suspicious_login`) get an `inferredDevice` field attached at read time via `inferLikelyDevice()` — a best-effort guess (closest `WorkspaceDevice.lastSyncTime` for that user), computed from already-synced DB data only (no live Google calls in this route), NOT authoritative — Google's login events carry no real per-event device reference to join against. GET `/connected-apps` [ADMIN] — current per-user connected third-party OAuth apps (`ConnectedApp`, a snapshot not an event log), filters `userEmail`; populated by the `syncConnectedApps` cron. GET `/connected-apps/users` [ADMIN] — fast list of every active Workspace account + its last-known app count (one `users.list` call + one grouped DB query, no per-user `tokens.list`). GET `/connected-apps/top` [ADMIN] — most-connected apps org-wide by account count, grouped by `appName` (falls back to `clientId`), `limit` query param (default 5, max 20); reads cached rows only. Backs the Manage Console's Connected Apps pie chart + top-5 list. POST `/connected-apps/sync` [ADMIN] — syncs every active user in one call (slow on a large org — one `tokens.list` call per user); this is what the Connected Apps tab calls on load so every account's count is accurate immediately. POST `/connected-apps/sync/:userEmail` [ADMIN] — on-demand sync for one account only; used by the tab's per-account "Refresh" action. GET `/devices` [ADMIN] — per-user device inventory (`WorkspaceDevice`, a Cloud Identity Devices API snapshot, NOT correlated to `WorkspaceActivityEvent` rows — see model comment), filters `userEmail`. GET `/devices/users` [ADMIN] — fast list of every active Workspace account + its last-known device count (mirrors `/connected-apps/users`); backs the Devices tab's default view. POST `/devices/sync` [ADMIN] — manual full org resync (slow — `deviceUsers.list` caps at 20/page); a manual escape hatch, not called by the Devices tab. POST `/devices/sync/:userEmail` [ADMIN] — on-demand per-account sync (filtered Cloud Identity calls via `syncWorkspaceDevicesForUser`, not a full sweep); this is what the Devices tab calls when an account is expanded. GET `/recovery` [ADMIN] — stored snapshot of the **admin-set** `recoveryEmail`/`recoveryPhone` on each Workspace account (`WorkspaceRecoveryInfo`, Directory API `users.list`/`users.get`; NOT the user-set recovery info from myaccount.google.com, which Google exposes through no admin API), filters `userEmail`. GET `/recovery/users` [ADMIN] — every active Workspace account left-joined with its recovery snapshot, inline (one `users.list` + one DB read, no per-user Google calls) — backs the "Recovery" tab, which shows the pair directly with no expand step. POST `/recovery/sync` [ADMIN] — full org resync (one paginated `users.list`), no-op until Workspace monitoring is configured. POST `/recovery/sync/:userEmail` [ADMIN] — on-demand single-account resync (`users.get`); the Recovery tab's per-row "Refresh". |
| `/api/backups` | `routes/backups.ts` | GET `/`, `/:filename`; POST `/run` — all [ADMIN]. Audit-log CSV backups written by `services/auditBackup.ts`'s retention sweep (Settings → Backups tab controls the `AUDIT_LOG_RETENTION_DAYS`/`MAX_AUDIT_BACKUPS` `OrganizationPolicy` rows; `/run` triggers a sweep on demand). Files live in `backend/backups/` (gitignored), never in Postgres. |
| `/api/integrations` | `routes/integrations.ts` | POST `/discord/interactions` (unauthenticated in the JWT sense — Ed25519-signature-verified instead, see file header), `/gchat/events` (Google-bearer-token-verified), `/discord/link-code` [ALL]. Inbound approve/deny from the Discord/Google Chat alert buttons `services/webhookAlerts.ts` sends; shares logic with `PATCH /api/requests/:id/approve|deny` via `services/accessRequests.ts`. Discord needs an account-link step first (`User.discordUserId`, `Profile.jsx` "Link Discord"); Google Chat piggybacks on Workspace email, no linking needed. See `docs/discord-google-chat-alerts-bot.md`. |
| `/api` (misc) | `routes/misc.ts` | `/grants/me`, `/grants/:id`, `/notifications`, `/notifications/stream`, `/notifications/read-all`, `/notifications/:id/read`, `/audit`, `/health/scores`, `/health/check/:id` — `/notifications/stream` is a live SSE feed, not behind `requireAuth` (`EventSource` can't set an Authorization header; the access token travels as a `?token=` query param and is verified by hand in the route instead, same pattern as `/api/integrations`'s non-JWT auth). Fed by `services/sseHub.ts`. |

Every protected route uses `requireAuth` then optionally
`requireRole("MANAGER","ADMIN")` etc. from `middleware/auth.ts`. Role
enforcement is **server-side only** — never trust the frontend route
guards for security, they're UX only (see `frontend/src/App.jsx`).

Routes that let a MANAGER act on a specific `Account` (reveal, reveal-otp,
approve/deny an AccessRequest, health re-check) must also call
`isAccountInManagerScope(req.user, account.collectionId)` from
`middleware/auth.ts` — `requireRole` alone only checks the role, not
whether the account is inside that manager's assigned `Collection`s.
ADMIN is exempt from this check; USER goes through a separate
`AccessGrant` check instead. This was a real gap (fixed 2026-07-20, see
`buildlogs/`) — apply the same helper to any new Manager-reachable route
that touches an Account.

Separately, any route that lets a non-ADMIN request or reveal an Account's
secret must also call `meetsClearance(req.user.clearanceLevel,
account.requiredClearance)` from `services/clearance.ts` — a second,
independent gate from Collection scope (`POST /api/requests`, `PATCH
/api/requests/:id/approve`, `POST /api/accounts/:id/reveal`, `POST
/api/accounts/:id/reveal-otp` all call it). ADMIN is exempt; MANAGER is
gated by clearance in addition to Collection scope, not instead of it.

### Services (`src/services/`)

| File | Responsibility |
|---|---|
| `secretManager.ts` | Stores/fetches raw passwords. Prod: Google Cloud Secret Manager. Fallback (Render/Supabase/Dev): AES-256 encrypted string stored in PostgreSQL (safely decoupled using `SECRET_ENCRYPTION_KEY` env var). **Raw passwords never touch Postgres in plaintext** — only `Account.secretRef` (the encrypted token) is stored there. |
| `kms.ts` | Envelope-encryption master key handling; falls back to a local key file (`backend/local_master.key`, gitignored) when GCP KMS isn't configured. |
| `health.ts` | Pure password-strength scoring function (0-100 → WEAK/MEDIUM/STRONG). No I/O. |
| `notifications.ts` | Creates `Notification` rows + sends email via Gmail API (console fallback in dev) + pushes to any live SSE connection via `sseHub.ts` for instant delivery. Fire-and-forget by design — a notification failure must never block the calling action. Rate-limited to 1 email/user/event-type/hour. |
| `sseHub.ts` | In-process Server-Sent-Events hub (`Map<userId, Set<Response>>`) backing `GET /api/notifications/stream` — lets `notifications.ts`'s `notifyUser()` push a new notification to an already-open tab immediately instead of waiting on `NotificationBell.jsx`'s 60s poll (still the fallback path). In-process only: doesn't work across multiple backend instances without a shared pub/sub. |
| `redis.ts` | Redis client for JTI/session cache, with an in-memory `Map` fallback if Redis is unreachable. |
| `csvImport.ts` | Dependency-free CSV parser (quoted fields/commas/newlines) used by `POST /api/accounts/bulk-import`. |
| `webhookAlerts.ts` | Chat alerts (`sendChatAlert`) to Discord/Google Chat incoming webhooks for `ACCESS_REQUESTED`/`ACCESS_APPROVED`/`ACCESS_DENIED` and the three `WORKSPACE_*` events below. Webhook URLs read from `OrganizationPolicy` (`DISCORD_WEBHOOK_URL`, `GCHAT_WEBHOOK_URL`), configured on `Settings.jsx`'s Alerts tab. Fire-and-forget like `notifications.ts` — a chat-platform outage never blocks the calling handler. Called from `routes/requests.ts` and `services/googleWorkspace.ts`. `ACCESS_REQUESTED` alerts include inline Approve/Deny buttons (handled by `routes/integrations.ts`) when `payload.requestId` is set — see `docs/discord-google-chat-alerts-bot.md`. |
| `accessRequests.ts` | `approveAccessRequest`/`denyAccessRequest` — the actual AccessRequest state-change + `AccessGrant` creation + notify/audit logic, factored out of `routes/requests.ts` so `routes/integrations.ts` (chat-originated approve/deny) can't drift from the web path's clearance/collection-scope checks. Throws `RequestActionError` with a `code` (`CONFLICT`/`FORBIDDEN`/`CLEARANCE`/`NOT_FOUND`) that each caller maps to its own response shape (HTTP status vs. chat message). |
| `discordSignature.ts` | `verifyDiscordSignature` — Ed25519 signature check for Discord's Interactions Endpoint POSTs, implemented with Node's built-in `crypto` (no new dependency) by wrapping Discord's raw hex public key in the fixed SPKI DER header `crypto.createPublicKey` expects. |
| `discordLink.ts` | In-memory one-time-code store (10 min TTL) for the `Profile.jsx` "Link Discord" flow → `/orkavault link <code>` in Discord. Same disposable-cache pattern as `redis.ts`'s JTI fallback; losing codes on restart is fine since the user just re-generates one. |
| `googleWorkspace.ts` | Three things, same domain-wide-delegation credential: (1) Polls the Google Admin SDK Reports API (`activities.list`, "login"/"token") for Workspace login and OAuth-grant *events* org-wide, persists to `WorkspaceActivityEvent` (append-only), and flags events per `evaluateAlert` (Google's suspicious-login signal, any new OAuth grant, or a login outside the `WORKSPACE_ALLOWED_IPS`/`WORKSPACE_ALLOWED_COUNTRIES` `OrganizationPolicy` allow-lists — country matching is best-effort, only applied when Google's event happens to carry a country field). Flagged events notify via `notifyAdmins` + `sendChatAlert`. Also reads `networkInfo.regionCode`/`subdivisionCode` (approximate location, top-level fields on the Activity resource, not event parameters) — note there is deliberately no per-event device field: Google's `userDeviceInfo` is NOT populated for `login`/`token` events at all (confirmed against Google's own field-coverage list), regardless of device enrollment, so device data lives in (3) instead, uncorrelated to specific events. (2) `syncConnectedApps()` enumerates every active Workspace user (Directory API `users.list`) and syncs each one's current OAuth grants (`tokens.list`) into `ConnectedApp` — a current-state snapshot (upsert + delete-stale), not an event log, so it shows apps connected before monitoring existed too, unlike (1). Runs up to `CONNECTED_APPS_SYNC_CONCURRENCY` (10) users at once via `mapWithConcurrency`, not sequentially — both Directory API calls are wrapped in `withRetry429` (exponential backoff + jitter, honors `Retry-After`) since Admin SDK calls are free but rate-limited, not billed. (3) `syncWorkspaceDevices()`/`syncWorkspaceDevicesForUser()` call the **Cloud Identity Devices API** (a different API/scope — the full `cloud-identity.devices`, not `.readonly`; domain-wide delegation authorization is matched by exact scope string, and only the full scope was actually authorized here even though this code only ever calls `.list()` — needs Endpoint Verification/GCPW/Drive for Desktop actually installed on a device for it to show up there, mobile is usually automatic). `devices.list` + `devices.deviceUsers.list({parent: "devices/-", filter})` are joined by `deviceResourceId()` — the `{id}` segment shared by both resources' `name` field, NOT `Device.deviceId` (a separate identifier that doesn't reliably equal that segment; keying the join off it was a real bug here, silently nulling every Device-sourced field while DeviceUser-sourced fields like `managementState` populated fine). The per-user variant passes `filter: "email:<address>"` (same "Mobile device search fields" vocabulary the legacy Directory API uses) to scope both calls instead of walking the whole org — results are still filtered client-side to an exact email match since that filter is a partial/substring match per Google's docs. Upserts into `WorkspaceDevice`, another current-state snapshot. `getAuthClient()` caches a single JWT instance for the process lifetime rather than rebuilding one per call — important since (2) calls it once per active user; a fresh instance each time meant a fresh OAuth token exchange each time too, which was flooding (1)'s ingested events with token-exchange noise for the impersonated admin subject. `ingestWorkspaceActivity()` also filters out our own polling noise via `isOwnPollingNoise()` — domain-wide delegation makes our own API calls look, from Google's side, like the admin subject authorizing this client, which otherwise shows up as a fake `oauth_token_grant`. Primary check is an exact match on `getOwnClientId()` (the service account's own Client ID, from the same cached key file); fallback is any `oauth_token_grant` on `ADMIN_EMAIL` itself with a bare-numeric `client_id` (real third-party apps' client_ids always end in `.apps.googleusercontent.com`; only service accounts get a bare number), in case the exact match ever misses (e.g. a key rotation, or a Reports API value-encoding quirk). The `ConnectedApp` name-lookup fallback inside `ingestWorkspaceActivity()` (upgrading a fallback `appName` to a friendlier one already learned via (2)) is wrapped in its own try/catch deliberately — it's cosmetic, and must never be able to abort the main event-processing loop if that one lookup fails. Needs domain-wide delegation: `GOOGLE_WORKSPACE_ADMIN_EMAIL` env var + a service-account key file at `GOOGLE_WORKSPACE_SA_KEY_PATH` (default `backend/local_workspace_sa_key.json`, gitignored, same pattern as `local_master.key`). `isWorkspaceMonitoringConfigured()` gates all three — until both env vars are set, the crons no-op (logs once, not every tick). Driven by the `ingestWorkspaceActivity` (every 30 min), `syncConnectedApps` (every 6h), and `syncWorkspaceDevices` (every 6h) crons in `index.ts`. See `docs/google-workspace-admin-sdk-monitoring.md`. (4) `syncWorkspaceRecovery()`/`syncWorkspaceRecoveryForUser()` read the **admin-set** `recoveryEmail`/`recoveryPhone` fields via the Directory API (`users.list` full-org / `users.get` single) into `WorkspaceRecoveryInfo` — same current-state-snapshot + delete-stale pattern as (2)/(3), upsert on `userEmail`. Only the admin-console-managed recovery contacts are exposed by the API; a user's own recovery info set at myaccount.google.com is stored separately by Google and readable through no admin API. Uses the `admin.directory.user.readonly` scope already in `SCOPES` — no new scope or DWD re-authorization. Driven by the `syncWorkspaceRecovery` (every 6h) cron. |
| `clearance.ts` | `meetsClearance(userLevel, requiredLevel)` — ranks the free-text clearance tiers (`CLEARANCE_TIERS`, shared shape with `frontend/src/lib/clearance.js`) and compares. Used wherever an Account's `requiredClearance` gates a User. |
| `totp.ts` | Decodes an uploaded authenticator QR image server-side (`jimp` + `jsqr`) to validate it and, on demand, compute the current 6-digit TOTP code (`otplib`) — the raw QR/secret itself is never handed out except to ADMIN via `reveal-qr`; everyone else only gets the rotating code via `reveal-otp`. |
| `auditBackup.ts` | Audit-log retention sweep: finds `AuditLog` rows older than the `AUDIT_LOG_RETENTION_DAYS` `OrganizationPolicy` (disabled/unset = keep forever), writes them to a CSV under `backend/backups/`, then purges them from Postgres — write-then-delete, so a failed write never loses rows. Trims old backup files down to `MAX_AUDIT_BACKUPS` (default 10) after each sweep. Driven by the `checkAuditRetention` cron in `index.ts` (every 24h) and by `POST /api/backups/run`. |
| `workspaceAccountSync.ts` | `syncWorkspaceAccountsToVault(triggeredByUserId)` — auto-provisions a vault `Account` for every active Google Workspace user (`googleWorkspace.ts`'s `listActiveWorkspaceUsers()`) who doesn't already have one. Create-only: matches on existing `Account.username` (any `platformType`, case-insensitive) and skips entirely on a match — never updates name/owner/notes on an existing entry. New accounts get `isGoogleSSO: true`/`secretRef: "SSO_ONLY"` (no real secret to store, tracks access to the person's own Workspace login) and `qaStatus: "APPROVED"` immediately. `ownerId` is the matching OrkaVault `User` by email if one exists, else the triggering admin (flagged in `notes` so it's findable/reassignable). Admin-triggered only via `POST /api/accounts/sync-workspace` — no cron. |
| `staleApprovals.ts` | `expireStaleApprovals()` — deactivates any `AccessGrant` still unviewed (`firstRevealedAt: null`) past its 24h "must view by" deadline (`expiresAt`, set at approval time — see `accessRequests.ts` + `routes/accounts.ts`'s reveal/reveal-otp) and notifies the user (`ACCESS_APPROVAL_EXPIRED`) that they need to submit a new request. `AccessRequest.status` stays `APPROVED` (no separate expired status) — the frontend derives "expired, request again" from `hasGrant: false` while `status === APPROVED`. Driven by the `expireStaleApprovals` cron in `index.ts` (hourly). |

### Scripts (`src/scripts/`, run manually via `ts-node`, not imported by the app)

- `seedMockDirectory.ts` — seeds fake org-directory users for dev/demo.
- `clearTestUsers.ts` — wipes test accounts.
- `offboarding.ts` — one-off/manual run of the offboarding sweep (the same logic also runs automatically as a cron in `index.ts`).

Ad hoc one-off migration/admin scripts should not live at the `backend/`
root long-term — they tend to accumulate hardcoded connection strings and
never get cleaned up. If you need one, gitignore it immediately and delete
it once it's served its purpose.

### Cron jobs (in `index.ts`, run on startup)

- `checkOffboarding()` — every 24h. Auto-deactivates users past `endDate`, revokes their `AccessGrant`s, notifies admins.
- `checkRotationDue()` — every 24h. Notifies admins when a `RotationSchedule.nextDue` is within 7 days or overdue.
- `ingestWorkspaceActivity()` — every 30 min (`services/googleWorkspace.ts`). Polls Google Workspace login/OAuth-grant activity; no-ops until Workspace monitoring is configured.
- `syncConnectedApps()` — every 6h (`services/googleWorkspace.ts`). Syncs each active Workspace user's current connected third-party apps into `ConnectedApp`; no-ops until Workspace monitoring is configured.
- `syncWorkspaceDevices()` — every 6h (`services/googleWorkspace.ts`). Syncs the org-wide device inventory (Cloud Identity Devices API) into `WorkspaceDevice`; no-ops until Workspace monitoring is configured.
- `syncWorkspaceRecovery()` — every 6h (`services/googleWorkspace.ts`). Syncs each active Workspace account's admin-set `recoveryEmail`/`recoveryPhone` (Directory API) into `WorkspaceRecoveryInfo`; no-ops until Workspace monitoring is configured.
- `checkAuditRetention()` — every 24h (`services/auditBackup.ts`). Backs up + purges `AuditLog` rows past the retention window; no-ops until `AUDIT_LOG_RETENTION_DAYS` is set (Settings → Backups).
- `expireStaleApprovals()` — every 1h (`services/staleApprovals.ts`). Deactivates approved-but-never-viewed `AccessGrant`s past their 24h deadline, forcing a fresh request.

## 3. Frontend (`frontend/`)

```
src/App.jsx                 Route table + role-gated <ProtectedRoute>
src/main.jsx                Vite/React entry
src/lib/
  api.js                    axios instance: attaches JWT, auto-refreshes on 401
  authContext.jsx            AuthProvider/useAuth — current user, login/logout. `useAuth().user`
                             is the *effective* user: MANAGER/ADMIN can pick a lower `viewAsRole`
                             (profile menu, sessionStorage-backed) and `user.role` follows it —
                             frontend nav/guards only, the API still enforces the real role.
                             `realUser`/`realRole`/`canPreview`/`viewAsRole`/`setViewAsRole` expose
                             the real identity + the switch.
src/pages/                   One file per route (see table below)
src/components/              Shared UI: modals, tables, layout chrome
main.cjs, preload.cjs        Electron main process (desktop shell) — loads Vite dev server in dev, dist/ in prod
```

### Route → page → role

| Path | Page | Allowed roles |
|---|---|---|
| `/login`, `/register` | `Login.jsx`, `Register.jsx` | public |
| `/vault` | `Vault.jsx` | any authenticated user |
| `/requests` | `Requests.jsx` | any authenticated user |
| `/profile` | `Profile.jsx` | any authenticated user |
| `/manage` | `ManageConsole.jsx` | MANAGER, ADMIN |
| `/approvals` | `Approvals.jsx` | MANAGER, ADMIN |
| `/my-collections` | `ManagerCollections.jsx` | MANAGER |
| `/directory` | `Directory.jsx` | ADMIN |
| `/users` | `Users.jsx` | ADMIN |
| `/collections` | `Collections.jsx` | ADMIN |
| `/audit` | `Audit.jsx` | ADMIN |
| `/workspace-activity` | `WorkspaceActivity.jsx` | ADMIN |
| `/health` | `Health.jsx` | ADMIN |
| `/settings` | `Settings.jsx` | ADMIN |

`DashboardLayout.jsx` (+ `Sidebar.jsx`, `TopBar.jsx`) wraps all
authenticated routes. Role gating here is UX convenience only — the real
enforcement is `requireRole` server-side.

`Vault.jsx` is a 3-pane workspace (Catalog / Workspace / Dashboard, CSS
grid in a single route, not 3 separate pages) rather than a table — left
pane lists/filters/searches Accounts, center pane shows the selected
Account's detail + actions (request/reveal/edit/rotate/history), right
pane is a personal KPI/alerts/favorites/recent-requests summary.
`ManageConsole.jsx` (`/manage`) is the MANAGER/ADMIN landing page — a
tile grid linking out to the existing management pages (Approvals,
Directory, Users, Collections, Audit, Workspace Activity, Health,
Settings); those pages are unchanged routes, just reachable via tiles
instead of only the sidebar. Above the tiles, a metrics/charts section
(from `GET /api/directory`) plus, ADMIN-only, a Connected Apps section —
a pie chart of accounts by connected-app count (`GET
/api/workspace-activity/connected-apps/users`, capped to the top 10
accounts + an "Other" slice) and a Top 5 list (`GET
/api/workspace-activity/connected-apps/top`). Both read whatever's
already synced — visiting this page never triggers a live Google sync.
`TopBar.jsx` renders a Vault/Manage toggle for MANAGER/ADMIN that
switches between the two.

Visual design system: OrkaOS tokens (light/dark CSS variables + component
classes for buttons, cards, panes, sidenav, modals, etc.) live in
`src/index.css`; theme toggling is `src/lib/themeContext.jsx`
(`data-theme` attr + `dark` class on `<html>`, persisted to
localStorage). `tailwind.config.js` remaps Tailwind's `gray` scale and
`brand.*` colors to the OrkaOS palette, so most existing pages inherit
the new look from their existing `gray-*`/`brand-*` utility classes
without per-file changes.

### Notable components

- `AddEntryModal.jsx` / `EditEntryModal.jsx` — create/edit an Account (credential entry); largest components (~325 lines each).
- `BulkImportModal.jsx` — CSV bulk creation of Accounts via `POST /api/accounts/bulk-import`; client-generates the same template as `/templates/vault-entries-template.csv`.
- `QrUploadList.jsx` — shared per-row "pick a QR image, batch-save" list against `PATCH /api/accounts/bulk-qr`; used by both `BulkImportModal.jsx` (right after an import) and `QrPendingModal.jsx` (any time later).
- `QrPendingModal.jsx` — persistent view of every GOOGLE_WORKSPACE Account missing a QR (`platformType === GOOGLE_WORKSPACE && !isGoogleSSO && !hasTotpQr`, computed client-side from the already-loaded accounts list, not the bulk-import notes marker). Opened from a "QR Codes Pending (N)" button in `Vault.jsx`, ADMIN only, shown only when N > 0.
- `RevealModal.jsx` / `RevealPassword.jsx` / `RevealOtp.jsx` — the timed-reveal flow (90s single-view, computed TOTP code). `AdminQrModal.jsx` is the separate ADMIN-only view of the raw uploaded QR image (re-provisioning a device); everyone else only ever sees the rotating code from `RevealOtp.jsx`, never the QR/secret.
- `RequestModal.jsx` — submit an access request (VIEW_90S / TEMP_24H / ONGOING).
- `NotificationBell.jsx` / `NotificationToggle.jsx` — in-app notification UI.
- `AccessHistoryModal.jsx` — per-account audit trail.

## 4. Data model (`backend/prisma/schema.prisma`)

Core entities and how they relate:

- **User** — `role` (USER/MANAGER/ADMIN), `active`/`revoked` (approval + offboarding state), `managedCollections` (M2M → Collection, for managers), `discordUserId` (nullable, unique), `mfaEnabled` (boolean flag), `mfaSecret` (TOTP secret), and relation to `mfaDevices` list.
- **MfaDevice** — browser-registered device public key in JWK format, associated with a user to bypass MFA check via cryptographic signature.
- **Account** — a credential entry. `secretRef` points into Secret Manager/KMS (§2); Postgres never holds the raw secret. Has `healthScore`/`healthLabel`, `refreshCycle`/`nextRotationDue`, `qaStatus` (new entries need QA approval), optional `collectionId`, optional `requiredClearance` (free-text tier, must match one of `User.clearanceLevel`'s values — see clearance note in §2).
- **AccessGrant** — an active grant of a User → Account, with optional `expiresAt` and `accessType`. `expiresAt` is set immediately on approval (a 24h "must view by" deadline) and `firstRevealedAt` (null until then) marks whether it's actually been viewed yet — see `services/accessRequests.ts`, `routes/accounts.ts`'s reveal/reveal-otp, and `services/staleApprovals.ts`.
- **AccessRequest** — a pending/approved/denied request for access (`requestType`: VIEW_90S / TEMP_24H / ONGOING).
- **AuditLog** — append-only action log, optionally tied to an Account.
- **RotationSchedule** — 1:1 with Account, drives the `checkRotationDue` cron.
- **Notification** — in-app notifications per user (see `NotifType` enum for all event kinds).
- **WorkspaceActivityEvent** — external feed, not OrkaVault's own action log (that's `AuditLog`). One row per Google Workspace login/OAuth-grant event, keyed by `userEmail` (join key back to `User.email`), with `flagged` marking whether it triggered a notification. Also carries `regionCode`/`subdivisionCode` (from Google's `networkInfo`, a top-level field on the Activity resource, not an event parameter) — approximate location of whatever made *that specific API call* (for an OAuth grant via third-party SSO, that can be the app's own server, not the end user), only populated when Google resolves it. Deliberately has no *stored* device field — see `WorkspaceDevice` below for why — but the `GET /api/workspace-activity` route attaches a computed, non-authoritative `inferredDevice` guess to login rows at read time (see that route's entry above). Populated by `services/googleWorkspace.ts`'s cron, surfaced read-only at `GET /api/workspace-activity` / `/workspace-activity` (ADMIN).
- **ConnectedApp** — current-state snapshot (not an event log) of a Workspace user's connected third-party OAuth apps, keyed by `userEmail` + `clientId` (unique together). Synced by `services/googleWorkspace.ts`'s `syncConnectedApps()` cron (upserts current grants, deletes rows for apps no longer connected), surfaced read-only at `GET /api/workspace-activity/connected-apps` / the "Connected Apps" tab on `/workspace-activity` (ADMIN).
- **WorkspaceDevice** — current-state snapshot (not an event log, and NOT correlated to `WorkspaceActivityEvent` rows — Google's Reports API login/token events carry no per-event device data at all) of devices associated with each Workspace user, keyed by `userEmail` + `deviceId` (unique together). Source is the Cloud Identity Devices API, a different API/credential requirement than the rest of `googleWorkspace.ts` (needs Endpoint Verification/GCPW/Drive for Desktop installed for desktops; mobile is usually automatic). Synced by `syncWorkspaceDevices()`, surfaced read-only at `GET /api/workspace-activity/devices` / the "Devices" tab on `/workspace-activity` (ADMIN).
- **WorkspaceRecoveryInfo** — current-state snapshot (not an event log), one row per active Workspace account keyed by `userEmail` (unique), of the **admin-set** `recoveryEmail`/`recoveryPhone` from the Directory API. Deliberately does not (and cannot) carry the recovery info a user sets for themselves at myaccount.google.com — Google stores that separately and exposes it through no admin API. Synced by `services/googleWorkspace.ts`'s `syncWorkspaceRecovery()` (upsert + delete-stale), surfaced read-only at `GET /api/workspace-activity/recovery` / the "Recovery" tab on `/workspace-activity` (ADMIN).
- **OrganizationPolicy** — key/value org-wide settings (`routes/policies.ts`).
- **Collection** — named group of Accounts; Managers are assigned Collections and can only act within them.
- **Department** — configurable list of department names (Settings → Departments tab, `routes/departments.ts`). `User.department` is a free-text `String`, not a relation to this table — it's just validated/populated against this list. Auto-seeded once on server startup (`seedDefaultDepartments()` in `index.ts`) from the legacy hardcoded list plus any distinct `User.department` values already in the DB — only fires while the table is empty, so it won't resurrect departments an admin has deliberately deleted.

Relations worth remembering: `Account.collection`, `Collection.managers`
(User M2M), everything else hangs off `User` or `Account` with
`onDelete: Cascade`.

## 5. Auth flow

JWT access token (8h) + refresh token (7d), issued in `routes/auth.ts`,
verified in `middleware/auth.ts`. `requireAuth` **re-fetches the user from
the DB on every request** (never trusts the JWT's `active` claim) so an
admin deactivation takes effect immediately without waiting for token
expiry. Frontend axios instance (`lib/api.js`) auto-refreshes on a 401 and
redirects to `/login` if refresh also fails. Google OAuth login is a
separate path (`POST /api/auth/google`) alongside password login.

## 6. Where to make common changes

- **New API endpoint**: add to the relevant `backend/src/routes/*.ts`, wire `requireAuth`/`requireRole`; update the route table in §2 here.
- **New Prisma model/field**: edit `backend/prisma/schema.prisma`, run `npm run prisma:migrate` (wraps `prisma migrate dev` — generates a reviewable migration file under `prisma/migrations/` and applies it to your local DB; `prisma:generate` alone is enough for client-only changes with no schema change) in `backend/`; update §4 here. Production applies migrations via `prisma migrate deploy`, run automatically by the `start` script — don't reach for `prisma:db` (`db push`) for anything meant to ship; it doesn't produce a migration file, so there's nothing for `migrate deploy` to apply on the next deploy. It's kept only as a manual escape hatch.
- **New frontend page**: add to `frontend/src/pages/`, register in `App.jsx`'s `<Routes>`, add a `Sidebar.jsx` entry if it needs nav; update the route table in §3 here.
- **Secret handling changes**: `backend/src/services/secretManager.ts` (storage) and `kms.ts` (encryption) — never add a raw-password column to Prisma models.
- **Notification/email changes**: `backend/src/services/notifications.ts`; new event types need a `NotifType` enum entry in `schema.prisma`.
