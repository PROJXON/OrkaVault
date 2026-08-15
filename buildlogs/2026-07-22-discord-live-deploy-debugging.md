# Discord live deployment + setup debugging
Date: 2026-07-22

## Why
Follow-up to `buildlogs/2026-07-21-discord-gchat-approve-deny.md` — that
entry covers the code; this one covers actually standing up a real
Discord Application against the deployed Render backend and what broke
along the way. Recorded so tomorrow's session doesn't have to re-derive
the same setup steps or re-diagnose the same failure.

## What changed
- Render build command needed `npx prisma db push --accept-data-loss`
  for exactly one deploy, to get past a warning on the new
  `User.discordUserId` unique column. Confirmed safe (brand-new nullable
  column, no existing rows can violate it) and **reverted** back to
  `npx prisma db push` without the flag afterward — see the reasoning in
  the chat, not worth leaving a standing "skip data-loss checks" flag in
  an automated deploy for a database holding this app's actual data.
- Walked through Discord Application setup end-to-end against the live
  Render backend:
  - Application created in the Developer Portal; Bot user had to be
    added explicitly (newer Discord UI doesn't attach one by default).
  - `/orkavault` command registered via
    `backend/src/scripts/registerDiscordCommands.ts` — confirmed via
    `GET /applications/{id}/commands` that registration actually took.
  - Bot invited to the test server via OAuth2 URL Generator — needs
    **both** `bot` and `applications.commands` scopes checked, not just
    one; this was the actual cause of the command not appearing at
    first, not a propagation delay.
  - `DISCORD_PUBLIC_KEY` had to be set as a **Render dashboard**
    environment variable — a local `backend/.env` value (from earlier
    ngrok testing) does nothing for the deployed service, since `.env`
    is gitignored and never reaches Render.
  - Once that was set, the Interactions Endpoint URL
    (`https://<render-backend>/api/integrations/discord/interactions`)
    verified and saved successfully.
  - Linking flow (`Profile.jsx` "Link Discord" → `/orkavault link
    <code>`) confirmed working against the live deployment.

## Notes / gotchas
- **Open issue, unresolved tonight**: the `ACCESS_REQUESTED` alert posts
  to Discord successfully (message + link visible) but the Approve/Deny
  buttons don't render. Leading theory: a plain Incoming Webhook (create
  via Channel Settings → Integrations → Webhooks — what
  `DISCORD_WEBHOOK_URL` currently points at) may not reliably render
  interactive message components, vs. a message sent by the bot itself
  via the Bot API, which definitely would since the bot *is* the
  application. Not confirmed — next step is checking the Render backend
  logs for a `[WebhookAlerts] Discord webhook responded ###` line around
  a real alert send, to see whether Discord is erroring (payload
  problem, fixable in place) or silently accepting-and-dropping the
  components (would mean switching alert delivery from the incoming
  webhook to the bot API for Discord specifically). **Start here
  tomorrow.**
- If that theory holds and we do switch to bot-API delivery, note it
  reverses earlier guidance: `DISCORD_BOT_TOKEN` would need to live on
  the deployed server persistently (currently deliberately kept off it,
  see `services/discordSignature.ts`'s comment and the buildlog above) —
  don't make that change silently, it's a real tradeoff to confirm.
- **Security**: a live Discord bot token was pasted directly into this
  chat session during setup. User was told to rotate it immediately via
  Reset Token in the Developer Portal. **Unconfirmed whether this
  actually happened** — verify first thing tomorrow before doing
  anything else Discord-related, and don't reuse the old token value
  anywhere if it's still sitting in scrollback.
- Google Chat side (`GCHAT_PROJECT_NUMBER`, Chat app HTTP endpoint) has
  not been configured or tested at all yet — Discord was the only
  platform worked on tonight.
