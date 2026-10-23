# Consent, third-party removal, report-only CSP, Electron hardening (NEW-FEAT Phase 2)
Date: 2026-10-23

## Why
NEW-FEAT §2, §11.1, §11.3, §11.4. Before personal secrets live in the browser
(Phases 5–8), no third-party code may load without consent, a CSP must
exist, and the desktop shell must be sandboxed.

## What changed
- frontend/src/assets/fonts/: Inter 4.1 `InterVariable.woff2` + OFL license; `@font-face` in `src/index.css`. Google Fonts links removed from `index.html`.
- frontend/src/lib/consent.js (new): versioned `orka-consent` store, session grant, `openConsentSettings()`, `isDesktopApp()`.
- frontend/src/components/ConsentBanner.jsx (new): non-modal bottom bar, mounted in `main.jsx`.
- frontend/src/components/GoogleAuthGate.jsx (new): `GoogleOAuthProvider` only around the Login/Register Google buttons, after consent or a click. The app-wide provider and the `"dummy-client-id"` fallback were removed from `main.jsx`.
- frontend/csp.config.js (new) + vite.config.js `cspPlugin`: single CSP source. Writes `dist-csp/nginx-csp.conf` (Dockerfile copies it, nginx.conf.template includes it). Injects a `<meta>` CSP for Electron builds. Warns on firebase.json/vercel.json drift.
- frontend/firebase.json, vercel.json: `Content-Security-Policy-Report-Only` header (generic variant).
- backend: `POST /api/csp-report` (misc.ts), scoped JSON parser for `application/csp-report` (index.ts), CSRF exemption, `cspReportLimiter`.
- frontend/main.cjs + preload.cjs: `sandbox: true`. Window-open is denied except the accounts.google.com popup. A will-navigate guard blocks non-app URLs; https/mailto open in the system browser. The unused, unrestricted `openExternal` bridge was replaced by `isDesktop`.
- package-lock.json (both apps): `npm audit fix --package-lock-only --omit=dev`, semver-compatible only. Frontend: axios 1.20.0, follow-redirects 1.16.1. Backend: grpc-js, brace-expansion, deepmerge-ts/prisma, fast-uri, multer, mysql2, proxy-addr (critical), qs. `npm audit --omit=dev` now reports 0 in both apps. Run `npm install` to pick these up.

## Notes / gotchas
- Fonts live in `src/assets/` (bundled + hashed by Vite) instead of `public/fonts/` as the plan suggested. Relative `url()` then works under both `base: "/"` and Electron's `base: "./"`.
- Hosting (§14.10) is undecided, so every host config got a CSP. firebase.json/vercel.json can't know the API origin, so their copy uses `https:` in connect-src/img-src and has no `report-uri`. Phase 9 must pin the real API origin before enforcing.
- Electron loads `file://`, which has no response headers, so `onHeadersReceived` can't deliver a CSP there. It uses a `<meta>` CSP instead, and a meta CSP can't be report-only, so **the desktop production build enforces now**. Dev Electron (Vite server) gets no CSP.
- Google sign-in is now a two-click flow without stored consent: first the first-party button (loads GIS), then Google's own button / One Tap.
- GIS CSP sources were checked against Google's documented list (`/gsi/client`, `/gsi/style`, `/gsi/` for frame/connect).
- Phase 3 adds the footer "Cookie settings" link that calls `openConsentSettings()`.
- npm rewrote frontend/package-lock.json with LF line endings, so the raw git diff is whole-file. Use `git diff --ignore-cr-at-eol` to see the 2 real bumps.
