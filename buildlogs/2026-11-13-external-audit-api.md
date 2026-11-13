# External audit API for OrkaSecurity (Phase 4c)

## Why

OrkaSecurity (an internal monitoring app on serverless hosting, no fixed
IP) needs to pull OrkaVault's audit log. Two gaps would have left it
blind: cascade deletes erased audit history along with a user or Account
(a reveal followed by an Account delete left no trace), and logins, MFA
changes, role changes, org-setting changes (including audit retention)
and similar security events were never audited. Plan:
`plan/phase-4c-external-audit-api.md`.

## What changed

**Schema** (`schema.prisma` only; prod `db push`, all additive or
relaxing):
- `AuditLog`: `seq Int @unique @default(autoincrement())` poll cursor;
  `userId` now nullable; both FKs `onDelete: SetNull`; `actorEmail` /
  `accountName` snapshots; `@@index([timestamp])`.
- New `ApiKey` model (hash + last 4 only), two back-relations on `User`.
- `NotifType.API_KEY_ALERT`.

**One audit write path:** `services/audit.ts` (`writeAudit`,
`writeAuditSafe`, `auditRow(s)`) typed against the new catalog
`config/auditActions.ts` (built in its 4d §1a shape now, so 4d doesn't
have to move it). Every existing `auditLog.create` moved onto it with
action strings unchanged. Account delete / bulk-delete backfill
`accountName` on legacy rows in the same transaction before deleting.
The dynamic `QA_${qaStatus}` became explicit `QA_APPROVED`/`QA_REJECTED`
(same strings).

**New audit events:** `LOGIN_SUCCESS`/`LOGIN_FAILED` (password, Google,
MFA TOTP/device, every failure reason), `ADMIN_SETUP_FAILED`,
`USER_REGISTERED`, `MFA_ENABLED`/`DISABLED`/`DISABLE_FAILED`/`DEVICE_REMOVED`,
`PASSWORD_CHANGED`/`CHANGE_FAILED`, `USER_APPROVED`/`DECLINED`/
`ROLE_CHANGED`/`END_DATE_CHANGED`/`DEACTIVATED`/`PROFILE_UPDATED`,
`ORG_POLICY_CHANGED` (all four policy routes; bulk logs only real value
changes), `AUDIT_BACKUP_RUN` (manual + cron), `COLLECTION_*`,
`DEPARTMENT_*`, `DISCORD_LINKED`, `EXTERNAL_API_AUTH_FAILED`, `API_KEY_*`.
`from` values are read from the row before the update.

**External API:** `routes/externalAudit.ts` at `/api/external/v1/audit`
(GET `/`, `/status`), `middleware/apiKey.ts` (kill switch → ordinary 404,
Bearer-only, generic 401, capped failure audit rows, no cache),
three new limiters in `rateLimit.ts`. The request logger in `index.ts`
logs only the path for `/api/external/*`, so a key mistakenly sent in a
query string never reaches the logs.

**Key management:** `routes/apiKeys.ts` + `services/apiKeys.ts` at
`/api/api-keys` (ADMIN): list / create / regenerate / revoke, TOTP
step-up with 90 s replay block, 3-active limit in a Serializable tx,
admin notifications, daily `checkApiKeyExpiry` cron (7-day warning,
once per key via `expiryWarnedAt`).

**Frontend:** `components/settings/IntegrationsTab.jsx` (new Settings
tab), `Settings.jsx` honours `?tab=`, `NotificationBell.jsx` routes
`API_KEY_ALERT` there, `Audit.jsx` / `AccessHistoryModal.jsx` fall back to
the snapshots (and `attemptedEmail`) when the FK is null.

**Misc:** `auditBackup.ts` CSV gets a leading `seq` column + snapshot
fallbacks; `clearTestUsers.ts` refuses `NODE_ENV=production`.

**Docs:** `ARCHITECTURE.md` (middleware, config, routes, services,
cron, components, data model, security section), `CLAUDE.md` (audit
coverage convention), `DEVHELP.md` (runbook + OrkaSecurity contract),
`backend/.env.example` (`EXTERNAL_AUDIT_API_ENABLED`, commented out).

## Notes / gotchas

- **Verified in the sandbox:** `prisma validate` + `generate`, full `tsc
  --noEmit` clean, JSX syntax parse of every changed frontend file, lucide
  icon names. Ran the backend locally (no DB) and curled the auth layer:
  disabled → identical HTML 404 to any unknown path (no rate-limit or
  no-store headers); enabled → no header / malformed / `?key=` only /
  cookie only → 401, POST → 403 CSRF, `/api/api-keys` without session →
  401, well-formed key → reaches the DB lookup (503 here). No `oksec_`
  text in the server log. The 429 limiter check wasn't run.
- **Not verifiable here (needs a real DB):** everything in plan §9's
  "User on Windows / staging" list: polling, snapshots after delete,
  the new events, settle window, `/status` after a sweep, the whole
  Integrations tab flow, step-up replay/429, 3/3 limit, revoke/expiry.
- Express 5 rejects `router.all("*")`; the fallthrough is a
  `router.use(...)` returning 404 for GET/HEAD and 405 otherwise.
- `externalApiGate` is the first middleware on the router and calls
  `next("router")` when off, so a disabled API is truly indistinguishable
  from a missing route.
- The failure limiters count only the relevant status
  (`requestWasSuccessful`): 401 for the external API, 403 for step-up, so
  a 400 or 409 doesn't lock anyone out.
- Serialization-failure detection checks `P2034` and the driver adapter's
  `40001` because the error shape with `@prisma/adapter-pg` wasn't
  confirmed against a live DB.
- `AUDIT_BACKUP_RUN` is written by the daily cron whenever retention is
  configured, even with 0 rows backed up (one row a day; shows the sweep
  is alive).
- `writeAuditSafe` is used for the new non-transactional events, so an
  audit-write failure never turns a completed action into a 500.
  Transactional audits (deactivate, account delete, API key changes)
  are all-or-nothing.
- Open default from the plan, unchanged: an admin's API keys **survive**
  that admin being deactivated.
- Deploy: `db push` on Render applies the schema. Then set
  `EXTERNAL_AUDIT_API_ENABLED=true` when OrkaSecurity is ready. Privacy /
  Terms wording is Phase 4d §5.
