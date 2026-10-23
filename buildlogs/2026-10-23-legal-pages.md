# Legal and policy pages (NEW-FEAT Phase 3)
Date: 2026-10-23

## Why
NEW-FEAT §1. The System Use Notice gate and the registration Terms
checkbox (Phase 4) and the Personal Vault setup wizard (Phase 6) link to
these pages. The required-version source must also exist before Phase 4
can track acceptance.

## What changed
- backend/src/config/legalVersions.ts (new): `REQUIRED_TERMS_VERSION` / `REQUIRED_NOTICE_VERSION`, from `LEGAL_TERMS_VERSION` / `LEGAL_NOTICE_VERSION` or the constant. Both env vars are added to `.env.example`. Nothing imports it yet (Phase 4).
- frontend/src/lib/legalVersions.js (new): `TERMS`, `PRIVACY`, `COOKIES`, `NOTICE` `{version, effectiveDate, draft}` plus `LEGAL_CONTACT`. The two files carry cross-referencing comments.
- frontend/src/pages/legal/ (new): `LegalLayout.jsx` (sticky back/print/theme bar, TOC built from `sections`, version line, DRAFT banner from `draft`, `<Tbd>` placeholder, #hash scrolling), `Terms.jsx`, `Privacy.jsx`, `Cookies.jsx`.
- App.jsx: 3 public `/legal/*` routes. HashRouter under `file://`. ConsentBanner moved here from main.jsx, inside the router, so its links can navigate.
- frontend/src/components/LegalLinks.jsx (new): placed in the Login/Register footers, the Sidebar bottom (hidden when collapsed, shown in the mobile drawer), ConsentBanner, and the legal page footers. "Cookie settings" calls `openConsentSettings()` and is hidden in the desktop app.
- ConsentBanner.jsx: publishes `--consent-banner-h`. The `.consent-safe` class (Login, Register, legal pages) pads by it, so the bar never hides page content. It is also `no-print` now.
- lib/api.js: the refresh-failure redirect skips `/legal/*` and handles hash routing.
- index.css: `.legal-prose`, draft/tbd/note/table styles, `.consent-safe`, and `@media print` rules (hide `.no-print`, black on white).
- ARCHITECTURE.md, README.md updated.

## Content sources
- Privacy data inventory: from `schema.prisma` (User, MfaDevice, AccessRequest, AccessGrant, Notification, AuditLog, the Workspace* models), `auditBackup.ts` (retention sweep, 10 CSV backups default), `webhookAlerts.ts` (what Discord/GChat alerts include), `notifications.ts` (Gmail API), `misc.ts` (CSP reports are logged), and `rateLimit.ts` (in-memory IP).
- Cookie table: `routes/auth.ts` (8h/7d), `middleware/csrf.ts` (csrfToken, 7d), `themeContext`, `authContext` (viewAsRole, mfaDeviceId), `consent.js`, and `webCryptoMfa.js` (IndexedDB `OrkaVaultMFA`, the §1.6 spec gap).
- Personal Vault, breach checks (HIBP, written as opt-in per §14.8) and the vault-key statement are written as forward-looking ("being rolled out" / "not active yet"). Phase 9 finalizes them.

## Notes / gotchas
- **Electron prod routing was already broken before this phase.** BrowserRouter under `loadFile` sees the on-disk path (`/C:/…/dist/index.html`), which matches no route. HashRouter for `file:` fixes it for every route, not only `/legal/*`. The web build is unchanged. The old `window.location.href = "/login"` redirect would have pointed at `file:///login`, so it sets the hash there instead.
- **Logged-out access to /legal/* needed the api.js change.** AuthProvider calls `/auth/me` on every load. The 401 → refresh fails → old code hard-redirected to `/login` from any non-auth path.
- No user-delete route exists (users are deactivated). The Privacy page says so and describes the cascade only for an administrative record deletion. Workspace* rows are keyed by email, not FK, so they don't cascade. The page says that too.
- Open placeholders, marked `[TBD]` in the page text: hosting (§14.10), international terms (§14.12), the contact address (`LEGAL_CONTACT`), deactivated-account retention, Workspace event retention, offboarding vault retention (§14.7), admin vault visibility (§14.6), disciplinary wording, and the consent classification per jurisdiction.
- Verified here: backend `tsc --noEmit` clean, and a syntax-only TS parse of all 13 touched frontend files is clean. The rendered result is untested (the user tests on Windows).
