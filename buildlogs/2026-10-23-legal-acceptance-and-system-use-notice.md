# Legal acceptance tracking + System Use Notice (NEW-FEAT Phase 4)
Date: 2026-10-23

## Why
NEW-FEAT §3, §4. Registration must record acceptance of the Terms, and
every user must acknowledge an AC-8 System Use Notice before using the
app (again after a version bump). Builds on the Phase 3 legal pages and
`config/legalVersions.ts`.

## What changed
- schema.prisma: `User.termsVersionAccepted`, `termsAcceptedAt`, `noticeVersionAcknowledged`, `noticeAcknowledgedAt` (all nullable). **No migration folder**, unlike the plan said: prod runs `prisma db push` on deploy, and a migration folder crash-loops Render (see the 2026-09-02 incident). Client regenerated.
- services/legalAcceptance.ts (new): `acceptanceFlags`, `requiredVersion`, `recordAcceptance` (User update + `TERMS_ACCEPTED` / `NOTICE_ACKNOWLEDGED` AuditLog row in one transaction, `accountId: null`, `metadata: {version}`).
- middleware/auth.ts: `req.user` carries the two version fields. `/api/auth/acknowledge` is added to the no-MFA allowlist, because the gate runs before MFA setup.
- routes/auth.ts:
  - `POST /register` returns 400 unless `acceptedTermsVersion === REQUIRED_TERMS_VERSION`. On success it stores the version/time, plus the AuditLog row as a nested create, so both save atomically.
  - `GET /me` and the login responses (`/login`, `/google` login, both `/mfa/verify` branches) spread `acceptanceFlags`.
  - New `POST /acknowledge` (`requireAuth`): `{type, version}`. 400 on a bad type or a version mismatch (the response includes `requiredVersion`).
- Frontend:
  - `SystemUseBanner.jsx` (pre-auth, Login + Register).
  - `SystemUseNotice.jsx` (full-screen gate: acknowledge or sign out only, plus a required Terms checkbox when terms are also due).
  - `ProtectedRoute` renders the gate before the MFA redirect.
  - `authContext.refreshUser()` (no loading flash).
  - Register: required Terms checkbox. Submit is disabled and `GoogleLogin` isn't mounted (no button, no One Tap) until it's checked. Sends `acceptedTermsVersion: TERMS.version`.
  - `LegalLinks.jsx` exports `InlineLegalLink`.
- ARCHITECTURE.md: the route, service, User fields and components.

## Notes / gotchas
- **`/google` never creates users.** For a new email it returns `action: "register"` and the Register form submits to `/register`. So the plan's "google-create" check is the `/register` check, and `/google` needs no `acceptedTermsVersion`.
- **AC-8 wording.** Checked the SP 800-53 Rev 5 AC-8 statement (csf.tools mirror). Its four required statements are written for US Government systems. They're adapted to "PROJXON information system", and the notice is marked DRAFT via `NOTICE.draft` (§14.11 legal review).
- **Existing users all see the gate once after deploy.** Their version columns are null, so they also get the Terms checkbox. Expected: nobody has accepted anything yet.
- **The gate is enforced server-side** (added beyond the plan, which only specified the frontend gate; that alone could be bypassed by calling the API directly).
  - `requireAuth` returns `403 {legalAcknowledgmentRequired: true, …flags}` for every route except `/api/auth/me` and `/api/auth/acknowledge` until both are current. It runs before the MFA check.
  - The hand-verified SSE stream (`misc.ts`) applies the same check, plus the MFA check, which it was also missing.
  - `api.js` reloads the page on that 403, so a mid-session version bump lands on the gate.
- **Found a pre-existing Discord approval bypass** (deactivated managers could still approve). Fixed separately: see `2026-10-23-discord-approval-bypass-fix.md`.
- **Desktop app links.** `main.cjs` denies `window.open` for app URLs, so `target="_blank"` would do nothing there. `InlineLegalLink` navigates in place in Electron.
- **Version drift.** The frontend sends its own `TERMS.version` / `NOTICE.version`. If the frontend and backend `legalVersions` files disagree, `/acknowledge` and `/register` return 400 with a "reload" message. Keep them in sync.
- Verified here: backend `tsc --noEmit` is clean, and a syntax-only parse of the 7 touched frontend files is clean. Vite can't start in the sandbox (`node_modules` has the Windows rolldown binding). The rendered behaviour is untested (the user tests on Windows).
