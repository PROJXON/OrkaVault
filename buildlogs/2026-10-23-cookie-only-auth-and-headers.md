# Cookie-only auth, CSRF, security headers, rate limits

Phase 1 of `plan/` (NEW-FEAT §5, §11.2). No schema change. **New backend
deps:** `helmet`, `express-rate-limit`. Run `npm install` in `backend/`.

## Why
The personal vault (later phases) puts decrypted secrets in the browser, so
an XSS becomes a full vault compromise. Before that ships, no auth token may
be readable by page JavaScript, and the API needs basic hardening.

## What changed
- **Tokens out of JS reach.** `authContext.jsx` no longer writes
  `accessToken`/`refreshToken` to localStorage, and on load it deletes any
  left over from older builds. `api.js` refreshes via `POST /auth/refresh`
  with no body and never sets `Authorization`. `/login`, `/google` and
  `/mfa/verify` no longer return tokens in the JSON body; the two MFA
  responses did.
- **SSE via cookie.** `NotificationBell.jsx` opens
  `EventSource(url, { withCredentials: true })`; `misc.ts` reads
  `req.cookies.accessToken` instead of `?token=`.
- **Cookie helper.** The cookie options block that was repeated 6× in
  `routes/auth.ts` is now `setAuthCookies()` / `setAccessCookie()`, with
  the attributes from `authCookieOptions()` in `middleware/auth.ts`.
  `/logout` clears both cookies with those same attributes (before, a bare
  `clearCookie` didn't match `sameSite=none; secure`, so production
  browsers kept the cookies), and clears the CSRF cookie too.
- **CSRF** (`middleware/csrf.ts`, new, mounted globally). Synchronizer
  token: `GET /api/auth/csrf` sets an httpOnly `csrfToken` cookie and
  returns the value; unsafe requests must echo it in `X-CSRF-Token`.
  `api.js` handles it transparently and retries once on `CSRF_INVALID`.
  The Discord interactions webhook is exempt.
- **Headers.** `helmet()` in `index.ts`, with `crossOriginResourcePolicy:
  cross-origin` so avatars under `/uploads` still load on the frontend.
- **Rate limits** (`middleware/rateLimit.ts`, new). `authLimiter` (30 per
  15 min per IP) on register, login, refresh, google and mfa/verify.
  `vaultKeysLimiter` / `vaultWriteLimiter` are defined for Phase 5, keyed
  per user.

## Decisions / gotchas
- **CSRF approach.** Hosting (§14.10) is still undecided, so this uses the
  approach that works cross-site *and* under Electron's `file://` origin:
  the token is returned in the body because the frontend can't read a
  cookie from the API's domain. A classic "read the cookie in JS" double
  submit would not have worked cross-site. If frontend and API end up on
  one registrable domain, cookies can move to `sameSite: lax`.
- **Rate-limit key.** `trust proxy` is `true`, so `req.ip` is the
  client-supplied left-most XFF entry, and keying on it would make the
  limiter trivially bypassable. Added `trustedClientIp()` to
  `utils/reqValue.ts`: the right-most public XFF entry, the one Render
  appended. `clientIp()` (used by the audit log) is unchanged and still has
  its documented forgeable-left-most caveat.
- Limiter store is in-memory, so it resets on restart and isn't shared
  across instances. That's fine for one instance.
- An open SSE stream isn't re-authenticated. If it drops after the access
  cookie expired, the reconnect 401s and stays closed until reload; the 60s
  poll still covers it. Same as before.
- `AdminDashboard.jsx` / `ManagerDashboard.jsx` / `UserDashboard.jsx`
  import `apiFetch` from `App.jsx`, which no longer exports it, and they
  aren't routed. They're dead code, left untouched. Their `?token=` is a
  reveal token, not auth.
- Also this session: the merge in `4431723` had committed conflict
  markers into 30 files. They were resolved to the pre-merge `8d601c8`
  content (plus the user's own fix-up commit `8ec0a5c`).

## Verify
- `tsc --noEmit` is clean. A grep for
  `localStorage.*Token|Bearer|query.token|data.accessToken` finds only the
  cleanup lines in `authContext.jsx`.
- **Needs testing on Windows:** email, Google and MFA login (both TOTP and
  remembered device); a forced refresh (delete the `accessToken` cookie,
  then click around); SSE toasts on approval; logout, then DevTools →
  Application shows no tokens in localStorage and the cookies gone; avatars
  load; Electron login. **Production:** confirm `/api/auth/csrf` works
  cross-site (cookies need `secure`, so HTTPS only).
