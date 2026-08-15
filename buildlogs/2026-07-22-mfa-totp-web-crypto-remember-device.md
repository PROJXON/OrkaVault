# MFA TOTP & Web Crypto Device Remembering
Date: 2026-07-22

## Why
Users need multi-factor authentication (MFA) support using standard TOTP QR codes, with a secure option to "Remember my device" to bypass subsequent MFA challenges on trusted devices. Additionally, all new and existing users must be required to set up MFA immediately upon logging in before they can access any sensitive resources. Standard stateless JWT sessions are vulnerable to token extraction, so we leverage Web Crypto API to generate browser-bound, non-extractable ECDSA keys.

## What changed
- backend/prisma/schema.prisma: Added `mfaEnabled`, `mfaSecret` to User model and added the `MfaDevice` model.
- backend/src/middleware/auth.ts: Added backend API enforcement to block requests to non-auth/profile resources for authenticated users without `mfaEnabled`.
- backend/src/routes/auth.ts: Updated login and Google OAuth routes to yield MFA challenges. Appended TOTP setup/verify/toggle routes and device revocation endpoints.
- backend/src/routes/profile.ts: Updated `/profile/me` endpoint selection query to include `mfaEnabled`.
- frontend/src/lib/webCryptoMfa.js: Created Web Crypto and IndexedDB helpers for device key generation, signing, and verification.
- frontend/src/lib/authContext.jsx: Exposed `mfaVerify` to authorization context, updated `login`/`continueWithGoogle` helpers to support MFA.
- frontend/src/components/DashboardLayout.jsx: Updates layout to hide standard sidebar and header for users who have not enabled MFA, replacing with a simple configuration page container.
- frontend/src/App.jsx: Updated `ProtectedRoute` to force a redirect to `/profile` if the user is logged in but `mfaEnabled` is false.
- frontend/src/pages/Login.jsx: Added security verification view, automated device key signature attempts, and implemented key registration.
- frontend/src/pages/Profile.jsx: Integrated a two-factor security panel with TOTP scan/manual setups, remembered device listings, and revokes. If the user does not have MFA configured, wraps all other cards in a conditional hook to isolate them on the setup panel.

## Notes / gotchas
- The private key is generated as `extractable: false` and kept in `IndexedDB`. If the user clears browser data or IndexedDB, the key is lost, requiring normal TOTP verification next time.
- Standard Prisma client generation was executed to update types, and local Postgres push should be run to sync DB schemas.
- Backend routing rules enforce the MFA lock natively, ensuring that even if a user tries to access API routes directly using their active access token, requests are blocked with `403` if MFA setup is pending.
- A constraint is enforced on both the backend and client-side preventing a user from revoking their last remaining MFA device key. They must register another device key before deleting the last one.
- Added support for a dedicated `SECRET_ENCRYPTION_KEY` environment variable in `secretManager.ts` to decouple AES-256 password encryption from the database connection string when deploying to Render and Supabase.
