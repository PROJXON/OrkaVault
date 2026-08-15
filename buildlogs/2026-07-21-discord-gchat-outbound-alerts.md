# Discord / Google Chat outbound alerts
Date: 2026-07-21

## Why
`docs/discord-google-chat-alerts-bot.md` (Part A) and
`docs/rollout-plan-workspace-and-alerts.md` (Phase 1) proposed sending
access-request activity to Discord/Google Chat webhooks as the lowest-risk,
no-auth-required first slice of the larger chat-bot effort. Phase 1 has no
open blocking questions (unlike Phase 3's bot-command auth), so it's safe
to build ahead of the harder inbound-command work.

## What changed
- `backend/src/services/webhookAlerts.ts`: new service, `sendChatAlert(event, payload)`.
  Reads `DISCORD_WEBHOOK_URL`/`GCHAT_WEBHOOK_URL` from `OrganizationPolicy`,
  posts a Discord embed and/or a Google Chat `cardsV2` card. Fire-and-forget,
  modeled on `notifications.ts` — never throws into the caller.
- `backend/src/routes/requests.ts`: calls `sendChatAlert` alongside the
  existing `notifyUser`/`notifyManagersAndAdmins` calls in `POST /`,
  `PATCH /:id/approve`, `PATCH /:id/deny`. Approve/deny handlers now also
  resolve the requester's name (approve: from the already-fetched `requester`
  inside the transaction; deny: fetched after, since deny's row lock query
  doesn't select it) for use in the alert text.
- `frontend/src/pages/Settings.jsx`: new "Alerts" tab (`AlertsTab`), same
  shape as the existing Departments tab — two URL inputs, saved via the
  existing `POST /api/policies/bulk`.
- `ARCHITECTURE.md`: added `webhookAlerts.ts` to the services table.

## Notes / gotchas
- No schema change — `OrganizationPolicy.value` is already a plain
  `String?`, same as every other org-wide setting.
- Not verified end-to-end against real Discord/Google Chat webhook URLs —
  the user is setting those up themselves and will paste them into the new
  Settings tab. Also, this sandbox has no local Postgres running and a
  broken (cross-platform) `node_modules` for the frontend build tooling
  (pre-existing, unrelated to this change), so neither a DB-backed manual
  script nor `vite build`/`npm run dev` could be run here to confirm.
  `npx tsc --noEmit` in `backend/` passes clean; the new JSX was checked
  by hand against the existing `DepartmentsTab` pattern it mirrors.
- Interactive Approve/Deny buttons on the alert message itself are
  deliberately not included — that's Part B/Phase 3 territory per the
  design docs (needs the bot-command auth work first). The Discord embed
  and Google Chat card both link back to `/approvals` instead.
- Follow-up (Phase 3, not started): inbound `/orkavault approve|deny|pending`
  commands, which is where the real auth design work (Google Chat
  signed-token verification vs. Discord account linking) lives.
