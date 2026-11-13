/**
 * Service API-key authentication for the external audit API (Phase 4c §4).
 *
 * This is a separate credential type from user sessions and the two never
 * cross: requireApiKey reads only `Authorization: Bearer <key>` and never
 * looks at cookies; requireAuth never accepts an API key.
 *
 * - Kill switch: unless EXTERNAL_AUDIT_API_ENABLED === "true" (read once at
 *   startup), externalApiGate makes the whole router fall through to the
 *   app's ordinary 404, indistinguishable from any unknown path.
 * - Every auth failure gets the same 401 body. The reason goes only into
 *   an EXTERNAL_API_AUTH_FAILED audit row (capped per hour so a guesser
 *   can't flood the table) and never the presented key, not even a prefix.
 * - No cache: one indexed lookup per request, so a revoke takes effect on
 *   the next call.
 */
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prismaClient";
import { EXTERNAL_API_ENABLED, KEY_FORMAT, hashKey, keyStatus, touchLastUsed } from "../services/apiKeys";
import { writeAuditSafe } from "../services/audit";

export interface ApiKeyRequest extends Request {
  apiKey?: { id: string; name: string };
}

type FailReason = "MISSING" | "MALFORMED" | "INVALID" | "REVOKED" | "EXPIRED" | "SCOPE";

/** First middleware on the external router: pretend the API doesn't exist when switched off. */
export function externalApiGate(_req: Request, _res: Response, next: NextFunction): void {
  if (!EXTERNAL_API_ENABLED) return next("router");
  next();
}

// Process-wide cap on EXTERNAL_API_AUTH_FAILED rows. Above it, failures go to
// the console only.
const AUDIT_CAP_PER_HOUR = 100;
let auditWindowStart = 0;
let auditWindowCount = 0;

function recordFailure(req: Request, reason: FailReason, key?: { id: string; name: string }) {
  const now = Date.now();
  if (now - auditWindowStart >= 60 * 60 * 1000) {
    auditWindowStart = now;
    auditWindowCount = 0;
  }
  if (auditWindowCount < AUDIT_CAP_PER_HOUR) {
    auditWindowCount++;
    void writeAuditSafe({
      action: "EXTERNAL_API_AUTH_FAILED",
      userId: null,
      metadata: { reason, ...(key && { apiKeyId: key.id, apiKeyName: key.name }) },
      req,
    });
  } else {
    console.warn(`[ExternalAudit] auth failed reason=${reason} (audit cap reached)`);
  }
}

export function requireApiKey(scope: string) {
  return async (req: ApiKeyRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!EXTERNAL_API_ENABLED) return next("router");

    const fail = (reason: FailReason, key?: { id: string; name: string }) => {
      recordFailure(req, reason, key);
      res.status(401).json({ error: "Unauthorized." });
    };

    const header = req.get("authorization");
    if (!header) return fail("MISSING");
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match || !KEY_FORMAT.test(match[1])) return fail("MALFORMED");

    let key;
    try {
      // A unique-index lookup on the SHA-256 of a 256-bit random key: the
      // caller controls the input but not its hash, so timing reveals
      // nothing useful and no constant-time compare is needed.
      key = await prisma.apiKey.findUnique({
        where: { keyHash: hashKey(match[1]) },
        select: { id: true, name: true, scopes: true, revokedAt: true, expiresAt: true },
      });
    } catch (error: any) {
      console.error("[ExternalAudit] key lookup failed:", error?.message ?? error);
      res.status(503).json({ error: "Service unavailable." });
      return;
    }

    if (!key) return fail("INVALID");
    const ref = { id: key.id, name: key.name };
    const status = keyStatus(key);
    if (status === "REVOKED") return fail("REVOKED", ref);
    if (status === "EXPIRED") return fail("EXPIRED", ref);
    if (!key.scopes.includes(scope)) return fail("SCOPE", ref);

    req.apiKey = ref;
    touchLastUsed(key.id);
    next();
  };
}

/** Cache-Control: no-store for every response on the router. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  next();
}
