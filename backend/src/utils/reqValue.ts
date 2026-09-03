import type { Request } from "express";

// Express 5 (path-to-regexp@6) types req.params/req.query values as
// string | string[] | undefined because routes *could* use repeating
// segments — none of ours do, so these are always single values at
// runtime. Coerce here instead of casting at every call site.
export function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Real client IP for audit logging. In production the app sits behind
// exactly one proxy — Render's platform load balancer — which appends the
// address it received the connection from as the LAST entry of
// X-Forwarded-For. That entry is written by infrastructure we control, so
// unlike req.ip (or the left-most XFF value) a client cannot forge it by
// sending its own X-Forwarded-For header. Falls back to the socket address
// for direct/local connections (dev, curl against the box itself).
//
// NOTE: this assumes a single trusted proxy hop. If another proxy is ever
// put in front of the API (e.g. Cloudflare proxying api.<domain>), the
// last XFF entry becomes that proxy's IP and this needs revisiting.
export function clientIp(req: Request): string | null {
  const header = req.headers["x-forwarded-for"];
  const chain = Array.isArray(header) ? header.join(",") : header;
  if (chain) {
    const parts = chain.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return stripV4Mapped(parts[parts.length - 1]);
  }
  return stripV4Mapped(req.ip ?? req.socket?.remoteAddress ?? null);
}

function stripV4Mapped(ip: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}
