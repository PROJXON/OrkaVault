- FIRST: confirm the Discord bot token that got pasted into chat last
  night actually got rotated (Developer Portal > Bot > Reset Token). If
  it wasn't done, do it before touching anything else Discord-related.

- Discord Approve/Deny buttons aren't rendering on the alert message
  (message + link show up fine, buttons don't). Check Render backend
  logs for a `[WebhookAlerts] Discord webhook responded ###` line from
  around when the alert was sent — see
  `buildlogs/2026-07-22-discord-live-deploy-debugging.md` for the full
  diagnosis plan. If it's the incoming-webhook-can't-render-components
  theory, we'll need to switch Discord alert delivery to send via the
  bot itself instead of the webhook URL (means DISCORD_BOT_TOKEN has to
  live on the deployed server going forward — confirm that tradeoff
  before making the change).

- Once buttons render, do a real end-to-end test: submit an access
  request, click Approve in Discord, confirm the AccessGrant actually
  gets created and the AuditLog entry shows metadata.source: "discord".

- Google Chat side: Resolved as outbound-only webhook alerts. Built the card formatting in `sendGoogleChat` under `backend/src/services/webhookAlerts.ts` with direct web links to approve/deny. The interactive bot/inbound route (`/gchat/events`) and Apps Script proxy were discarded due to Google Chat's platform limitations (incoming webhooks cannot host interactive buttons, and resolving user email identity requires complex restricted scopes/directory access).

- From docs/discord-google-chat-alerts-bot.md's still-open questions:
  decide whether linked Discord accounts should ever expire / require
  re-linking (right now a link persists forever once made), and whether
  access-request alerts need their own dedicated channel vs. sharing one
  with other alert types.

- Look at docs/suggested-features.md and pick 1-2 to actually build next
  time — dual-approval for the top clearance tier and the built-in
  password generator are probably the best ROI for the least added
  complexity, but read through all eight and decide.
