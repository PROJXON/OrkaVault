/**
 * Named rate limiters (NEW-FEAT §11.2). In-memory store: fine for the single
 * API instance we run today. Move to a shared store (services/redis.ts)
 * if the API is ever scaled horizontally, or each instance counts separately.
 */
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import type { AuthenticatedRequest } from "./auth";
import { trustedClientIp } from "../utils/reqValue";

// app.set("trust proxy", true) makes req.ip the client-supplied left-most
// X-Forwarded-For entry, which would let anyone dodge a limit by sending a
// fake header. Key on trustedClientIp() instead; ipKeyGenerator collapses
// IPv6 addresses to their /56 so one client can't rotate through a subnet.
const ipKey = (req: Request) => ipKeyGenerator(trustedClientIp(req) ?? "unknown");

// Authenticated limiters count per user, so users behind one office NAT
// don't share a bucket.
const userKey = (req: Request) => {
  const userId = (req as AuthenticatedRequest).user?.id;
  return userId ? `user:${userId}` : ipKey(req);
};

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  // We do our own IP extraction above, so the library's trust-proxy and
  // X-Forwarded-For sanity checks don't apply (and would log false alarms).
  validate: { trustProxy: false, xForwardedForHeader: false },
};

/** Login, register, Google sign-in, MFA verify, token refresh. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: ipKey,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

/** Unauthenticated CSP violation reports: keeps a noisy or hostile client from flooding the logs. */
export const cspReportLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: ipKey,
  message: "", // browsers ignore the response body
});

/** Personal vault key endpoints (Phase 5): wrapped-key fetch/upload, recovery. */
export const vaultKeysLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: userKey,
  message: { error: "Too many vault key requests. Please wait and try again." },
});

/** Personal vault entry writes (Phase 5). */
export const vaultWriteLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: userKey,
  message: { error: "Too many vault changes in a short time. Please slow down." },
});
