import type { Request } from "express";

// Express 5 (path-to-regexp@6) types req.params/req.query values as
// string | string[] | undefined because routes *could* use repeating
// segments — none of ours do, so these are always single values at
// runtime. Coerce here instead of casting at every call site.
export function asString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Real client IP for audit logging. On Render the X-Forwarded-For header
// the app receives looks like "<originating client>, <10.x internal
// proxy>[, ...]" — the client is the FIRST entry and Render's own proxy
// hops are appended after it. Bare req.ip (with no/loose trust-proxy
// config) just returns the socket peer, which is that internal 10.x
// address — hence the useless "10.25.111.8" in the audit log.
//
// Strategy: take the first entry of X-Forwarded-For that isn't a private/
// internal address, so we skip Render's 10.x / 127.x / ::1 hops even if
// the ordering shifts. Fall back to req.ip / the socket address for
// direct or purely-local connections (dev, curl against the box).
//
// Caveat: the left-most XFF entry is client-supplied and could be forged
// unless upstream infra strips it. Acceptable here (authenticated
// internal users) but revisit if the threat model changes.
export function clientIp(req: Request): string | null {
  const header = req.headers["x-forwarded-for"];
  const chain = Array.isArray(header) ? header.join(",") : header;
  const parts = (chain ?? "")
    .split(",")
    .map((s) => stripV4Mapped(s.trim()))
    .filter((s): s is string => !!s);

  const firstPublic = parts.find((ip) => !isPrivateIp(ip));
  if (firstPublic) return firstPublic;
  if (parts.length > 0) return parts[0];
  return stripV4Mapped(req.ip ?? req.socket?.remoteAddress ?? null);
}

function stripV4Mapped(ip: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

// RFC1918 + loopback + link-local + CGNAT (100.64/10) + IPv6 ULA/loopback.
// Used only to skip infra hops when picking the client IP out of XFF.
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "127.0.0.1" || v === "::1") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}
