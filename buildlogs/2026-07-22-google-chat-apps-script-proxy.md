# Google Chat Apps Script Proxy

Date: 2026-07-22

## Why
The organization's Google Cloud project has sticky configurations for the Google Chat API that permanently locked the "Build this Chat app as a Workspace add-on" setting. This prevented standard Google Chat HTTP triggers from routing directly to the backend. To avoid migrating the entire project (which holds other active production services), a Google Apps Script proxy is used to receive the Chat events and securely forward them to the Render backend.

## What changed
- [integrations.ts](file:///media/sf_OrkaVault/backend/src/routes/integrations.ts):
  - Updated `verifyGoogleChatRequest` to allow requests carrying an `X-OrkaVault-Secret` matching `process.env.GCHAT_BYPASS_SECRET`.
- [gchat-proxy.js](file:///media/sf_OrkaVault/gscripts/gchat-proxy.js):
  - Created a new directory and script containing the Apps Script proxy logic and setup instructions.
