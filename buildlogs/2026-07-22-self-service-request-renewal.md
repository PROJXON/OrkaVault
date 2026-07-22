# Self-service Request Renewal

Date: 2026-07-22

## Why
When `AccessGrant` temporary windows (e.g. `TEMP_24H`) expired, users had to re-submit requests from scratch. This friction pushed them to default to requesting `ONGOING` access to avoid repeating justifications, which goes against the principle of least privilege. Having a renew option pre-fill their last approved request details simplifies temporary access renewal.

## What changed
- [requests.ts](file:///media/sf_OrkaVault/backend/src/routes/requests.ts):
  - Added endpoint `GET /api/requests/last-approved/:accountId` to retrieve the user's most recent approved request for the given account.
- [RequestModal.jsx](file:///media/sf_OrkaVault/frontend/src/components/RequestModal.jsx):
  - Equipped the component with a `prefill` prop to populate form fields upon modal initialization.
- [Vault.jsx](file:///media/sf_OrkaVault/frontend/src/pages/Vault.jsx):
  - Added warning banner to show the remaining active access window for temporary grants.
  - Added a "Request Renewal" button when a temporary access grant is expiring in under 2 hours. Clicking this fetches the user's previous request details and opens the `RequestModal` with those values prefilled.
- [ARCHITECTURE.md](file:///media/sf_OrkaVault/ARCHITECTURE.md):
  - Updated the requests route table to document `GET /last-approved/:accountId`.
