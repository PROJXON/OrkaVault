/**
 * CSRF protection for cookie-authenticated requests.
 *
 * Auth cookies are sameSite "none" in production (frontend and API live on
 * different sites), so the browser attaches them to requests any other site
 * triggers. This closes that gap with a synchronizer token:
 *
 *  - GET /api/auth/csrf sets an httpOnly `csrfToken` cookie and returns the
 *    same value in the body. The frontend (lib/api.js) keeps it in memory.
 *  - Every unsafe request must echo it in the `X-CSRF-Token` header, and
 *    requireCsrf compares header to cookie.
 *
 * The token comes back in the response body because the frontend can't read
 * a cookie set by the API's domain. A cross-site attacker can neither read
 * that response (CORS) nor set the custom header without a preflight, so they
 * can't produce a matching pair. Works the same under Electron's file://
 * origin.
 *
 * Revisit once hosting is decided (NEW-FEAT §14.10): if frontend and API end
 * up on one registrable domain, cookies can go sameSite "lax" and this
 * becomes defence-in-depth only.
 */
import { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import { authCookieOptions } from "./auth";

const CSRF_COOKIE = "csrfToken";
const CSRF_HEADER = "x-csrf-token";
const CSRF_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // matches the refresh token
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Callers that aren't the browser app and authenticate some other way.
const EXEMPT_PATHS = [
  "/api/integrations/discord/interactions", // Ed25519 signature-verified webhook
  "/api/csp-report", // browser-sent CSP violation reports; no cookies/auth, only logs
];

/** GET /api/auth/csrf: reuse the current token if there is one, else mint one. */
export function issueCsrfToken(req: Request, res: Response) {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token =
    typeof existing === "string" && existing.length === 64
      ? existing
      : randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, { ...authCookieOptions(), maxAge: CSRF_MAX_AGE });
  res.json({ csrfToken: token });
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE, authCookieOptions());
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  if (EXEMPT_PATHS.includes(path)) return next();

  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);
  if (
    typeof cookie === "string" &&
    typeof header === "string" &&
    cookie.length === header.length &&
    timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
  ) {
    return next();
  }
  res.status(403).json({ error: "Invalid or missing CSRF token.", code: "CSRF_INVALID" });
}
