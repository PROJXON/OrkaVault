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

- Google Chat side hasn't been touched at all yet (Discord was the only
  platform set up last night). Needs: a Chat app created in Google Cloud
  Console, GCHAT_PROJECT_NUMBER set on the backend, the app's HTTP
  endpoint pointed at /api/integrations/gchat/events, and a real
  approve/deny click tested end-to-end.

- From docs/discord-google-chat-alerts-bot.md's still-open questions:
  decide whether linked Discord accounts should ever expire / require
  re-linking (right now a link persists forever once made), and whether
  access-request alerts need their own dedicated channel vs. sharing one
  with other alert types.

- Look at docs/suggested-features.md and pick 1-2 to actually build next
  time — dual-approval for the top clearance tier and the built-in
  password generator are probably the best ROI for the least added
  complexity, but read through all eight and decide.
