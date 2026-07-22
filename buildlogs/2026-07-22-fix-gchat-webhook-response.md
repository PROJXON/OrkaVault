# Revert Google Chat Interactive Approvals to Outbound Webhooks
Date: 2026-07-22

## Why
Due to severe constraints in the Google Chat platform (specifically that cards sent via Incoming Webhooks are strictly static and cannot trigger interactive callbacks or trigger Apps Script/HTTP endpoints, coupled with restricted Workspace scopes required for resolution of user emails), the interactive "Approve" and "Deny" buttons for Google Chat are being removed. The implementation has been simplified back to pure outbound notifications containing direct approval web links.

## What changed
- backend/src/services/webhookAlerts.ts: Removed the block of code that appended interactive "Approve" and "Deny" buttons to Google Chat alert messages, leaving only the standard "Open Approvals" / "View Details" button which resolves to a static link.
- backend/src/routes/integrations.ts: Removed the dead `/gchat/events` endpoint and verification helper function since inbound interactions are no longer handled.
