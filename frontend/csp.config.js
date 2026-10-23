// Content Security Policy: the single source of truth (NEW-FEAT §11.1).
//
// Every place a CSP is delivered is derived from buildCsp() here:
//   - nginx (Docker / Cloud Run): `vite build` writes dist-csp/nginx-csp.conf,
//     which the Dockerfile copies in and nginx.conf.template includes.
//   - Electron production build: `vite build` (ELECTRON=true) injects a <meta>
//     CSP, because file:// pages have no response headers to attach one to.
//   - firebase.json / vercel.json: static JSON can't import this file, so they
//     hold a copy of the generic variant (apiOrigin unknown → `https:`).
//     `vite build` warns if either copy drifts from buildCsp().
//
// Rollout: header delivery is Content-Security-Policy-Report-Only until
// Phase 9 switches it to enforce. A <meta> CSP can't be report-only, so the
// desktop build enforces now.
//
// Google Identity Services sources follow Google's documented CSP
// (developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

const GSI = "https://accounts.google.com/gsi/";

/** Origin of VITE_API_URL (same default as src/lib/api.js), or null if unparseable. */
export function apiOriginFrom(viteApiUrl) {
  try {
    return new URL(viteApiUrl || "http://localhost:5001").origin;
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string|null} opts.apiOrigin  backend origin; null = unknown at config time (uses `https:`)
 * @param {boolean} [opts.meta]         <meta> delivery: drops frame-ancestors / report-uri (ignored in meta)
 */
export function buildCsp({ apiOrigin, meta = false }) {
  const api = apiOrigin || "https:";
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `${GSI}client`],
    // 'unsafe-inline' is style-only: React inline style= attributes and the
    // small <style> in index.html. script-src stays strict.
    "style-src": ["'self'", "'unsafe-inline'", `${GSI}style`],
    "frame-src": [GSI],
    "connect-src": ["'self'", api, GSI],
    // googleusercontent: Google profile photos stored as avatarUrl.
    "img-src": ["'self'", "data:", "blob:", api, "https://*.googleusercontent.com"],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  if (!meta) {
    directives["frame-ancestors"] = ["'none'"];
    if (apiOrigin) directives["report-uri"] = [`${apiOrigin}/api/csp-report`];
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`)
    .join("; ");
}

export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
