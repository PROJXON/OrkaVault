# Discord/Google Chat inbound approve/deny
Date: 2026-07-21

## Why
`TASKS.md`: "get started on the approve and deny from discord / gchat".
`docs/discord-google-chat-alerts-bot.md` already had this designed as
Part B of a two-part proposal (Part A, outbound alerts, was already
implemented in an earlier session). This implements Part B's approve/deny
path — inline buttons on the existing chat alert, not a broader chat-bot
command surface (deferred; see the doc's "implemented vs. deferred"
section).

## What changed
- `backend/src/services/accessRequests.ts` (new): `approveAccessRequest`/
  `denyAccessRequest` factored out of `routes/requests.ts`'s inline
  transaction logic — now the single source of truth for the
  clearance/collection-scope checks, `AccessGrant` creation, and
  notify+audit side effects, called by both the web route and the new
  chat-integration routes. Throws a typed `RequestActionError` so each
  caller maps it to its own response shape.
- `backend/src/routes/requests.ts`: `PATCH /:id/approve`/`:id/deny`
  reduced to thin wrappers around the above — no behavior change.
- `backend/src/services/discordSignature.ts` (new): Ed25519 signature
  verification for Discord's Interactions Endpoint, using Node's built-in
  `crypto` (no new dependency) — Discord's raw hex public key gets
  wrapped in the standard SPKI DER prefix `crypto.createPublicKey`
  expects. Verified against a locally generated keypair (valid sig
  passes, tampered body / wrong key both correctly rejected).
- `backend/src/services/discordLink.ts` (new): in-memory 10-minute
  one-time-code store for the Discord account-linking flow.
- `backend/prisma/schema.prisma`: `User.discordUserId String? @unique`.
  Ran `prisma generate` (client codegen only — no DB in this sandbox to
  `db push` against; that needs to run once wherever this deploys with a
  live Postgres).
- `backend/src/routes/integrations.ts` (new), mounted at
  `/api/integrations`:
  - `POST /discord/interactions` — PING, the `approve:<id>`/`deny:<id>`
    button clicks, and `/orkavault link <code>`.
  - `POST /gchat/events` — `CARD_CLICKED` for the approve/deny buttons,
    authenticated via a Google-issued bearer ID token naming the invoking
    Workspace user (verified with `google-auth-library`, same library
    `routes/auth.ts`'s Google login already uses).
  - `POST /discord/link-code` — JWT-authenticated, called by `Profile.jsx`.
- `backend/src/index.ts`: mounts the new route; scopes `express.raw()` to
  `/api/integrations/discord/interactions` ahead of the global
  `express.json()` (same precedent as the existing `/api/accounts` 10mb
  override) so the raw bytes Discord signed are available for
  verification before any JSON parsing touches them.
- `backend/src/services/webhookAlerts.ts`: `ACCESS_REQUESTED` alerts now
  carry inline Approve/Deny buttons (Discord message components /
  Google Chat card buttons) when `payload.requestId` is set.
- `backend/src/routes/requests.ts`: `POST /` now passes `requestId` into
  `sendChatAlert` so the buttons above have something to act on.
- `frontend/src/pages/Profile.jsx`: "Link Discord" card (Manager/Admin
  only) — generates a code and shows the `/orkavault link <code>`
  instruction.
- `backend/src/scripts/registerDiscordCommands.ts` (new, one-off):
  registers the `/orkavault link` slash command with Discord's REST API.
  Not run automatically — needs a bot token, see docs.
- `docs/discord-google-chat-alerts-bot.md`, `ARCHITECTURE.md`: updated
  to reflect what's actually implemented vs. still deferred, plus setup
  steps and the new env vars.

## Notes / gotchas
- Both inbound routes are no-ops from the platform's perspective until
  configured (`DISCORD_PUBLIC_KEY`/`DISCORD_BOT_TOKEN`/
  `DISCORD_APPLICATION_ID`, `GCHAT_PROJECT_NUMBER`) — same
  "dormant until set up" pattern as Workspace monitoring. Nothing breaks
  if they're unset; the buttons just fail on the platform's side if
  clicked. See the doc's "Setup" section for the exact steps.
- Couldn't do a live end-to-end test in this sandbox (no real Discord
  Application or Google Chat app to point at, no outbound network to
  Discord/Google likely either) — verified what's actually testable
  in isolation: `tsc --noEmit` across the backend, and a standalone
  smoke test of `verifyDiscordSignature` against a locally generated
  Ed25519 keypair (valid/tampered/wrong-key cases all behaved correctly).
  Anyone wiring this up for real should sanity-check the first live
  button click before relying on it.
- Deliberately did **not** implement `/orkavault pending` or typed
  `/orkavault approve <id>` commands — the buttons cover the actual
  `TASKS.md` ask; see docs for the reasoning.
- `prisma db push` for the new `discordUserId` column still needs to run
  once against a real database — this sandbox has none.
