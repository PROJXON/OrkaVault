/**
 * Service API keys for the read-only external audit API (Phase 4c §4a).
 *
 * - Keys are `oksec_` + 43 base64url chars (32 random bytes). Only the
 *   SHA-256 hex of the full key is stored, plus its last 4 chars for the
 *   list UI. The plaintext is returned once from create/regenerate and is
 *   never logged, stored or put in audit metadata.
 * - At most MAX_ACTIVE_KEYS active keys, enforced in a Serializable
 *   transaction so two admins clicking at once can't reach 4.
 * - Creating or regenerating needs a fresh TOTP code (step-up) with replay
 *   protection; revoking doesn't (incident response must be fast).
 * - Rows are never deleted: revoked/expired keys stay as history.
 */
import { createHash, randomBytes } from "crypto";
import type { Request } from "express";
import { verifySync } from "otplib";
import { prisma, Prisma, ApiKey } from "../lib/prismaClient";
import { writeAudit, writeAuditSafe } from "./audit";
import { notifyAdmins } from "./notifications";

/** Database-independent kill switch. Read once at startup; off unless exactly "true". */
export const EXTERNAL_API_ENABLED = process.env.EXTERNAL_AUDIT_API_ENABLED === "true";

export const MAX_ACTIVE_KEYS = 3;
export const AUDIT_READ_SCOPE = "audit:read";
export const KEY_PREFIX = "oksec_";
export const KEY_FORMAT = /^oksec_[A-Za-z0-9_-]{43}$/;
export const ALLOWED_EXPIRY_DAYS = [30, 90, 365, null] as const;
export type ExpiryDays = (typeof ALLOWED_EXPIRY_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_FORMAT = /^[\w .\-()]+$/;
const HISTORY_WINDOW_MS = 30 * DAY_MS;
const EXPIRY_WARNING_MS = 7 * DAY_MS;

export class ApiKeyError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export interface KeyActor {
  id: string;
  email: string;
  name: string;
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function generateKey(): { plaintext: string; keyHash: string; keyLast4: string } {
  const plaintext = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { plaintext, keyHash: hashKey(plaintext), keyLast4: plaintext.slice(-4) };
}

export const activeWhere = (now = new Date()): Prisma.ApiKeyWhereInput => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

type KeyStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export function keyStatus(k: Pick<ApiKey, "revokedAt" | "expiresAt">, now = new Date()): KeyStatus {
  if (k.revokedAt) return "REVOKED";
  if (k.expiresAt && k.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

const LIST_INCLUDE = {
  createdBy: { select: { name: true, active: true } },
  revokedBy: { select: { name: true } },
} satisfies Prisma.ApiKeyInclude;
type KeyWithUsers = Prisma.ApiKeyGetPayload<{ include: typeof LIST_INCLUDE }>;

/** The only shape a key ever leaves the server in. Never includes keyHash. */
function toListShape(k: KeyWithUsers, now = new Date()) {
  return {
    id: k.id,
    name: k.name,
    last4: k.keyLast4,
    scopes: k.scopes,
    createdAt: k.createdAt,
    createdBy: k.createdBy ? { name: k.createdBy.name, active: k.createdBy.active } : null,
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
    revokedBy: k.revokedBy ? { name: k.revokedBy.name } : null,
    status: keyStatus(k, now),
  };
}

// ─── Validation ─────────────────────────────────────────────────────────

export function parseName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 1 || name.length > 64 || !NAME_FORMAT.test(name)) {
    throw new ApiKeyError(
      400,
      "Name must be 1–64 characters: letters, numbers, spaces, and _ . - ( ) only.",
      "INVALID_NAME",
    );
  }
  return name;
}

export function parseExpiry(raw: unknown): ExpiryDays {
  if (raw === null) return null;
  if (typeof raw === "number" && (ALLOWED_EXPIRY_DAYS as readonly (number | null)[]).includes(raw)) {
    return raw as ExpiryDays;
  }
  throw new ApiKeyError(400, "expiresInDays must be 30, 90, 365 or null (never).", "INVALID_EXPIRY");
}

const expiryDate = (days: ExpiryDays, from = new Date()) =>
  days === null ? null : new Date(from.getTime() + days * DAY_MS);

/** The old key's period, rounded to the nearest allowed value (or never). */
function inferExpiryDays(k: Pick<ApiKey, "createdAt" | "expiresAt">): ExpiryDays {
  if (!k.expiresAt) return null;
  const days = (k.expiresAt.getTime() - k.createdAt.getTime()) / DAY_MS;
  return ([30, 90, 365] as const).reduce((best, d) => (Math.abs(d - days) < Math.abs(best - days) ? d : best));
}

// ─── Step-up (fresh TOTP code) ──────────────────────────────────────────

const STEP_UP_REPLAY_MS = 90 * 1000;
const usedCodes = new Map<string, number>(); // `${userId}:${code}` -> expiry (ms)

/**
 * Verifies a current authenticator code for the acting admin. A code that
 * already passed in the last 90 s is rejected even if still in its TOTP
 * window. Failures write API_KEY_STEPUP_FAILED. Rate limited by
 * apiKeyStepUpLimiter at the route.
 */
export async function verifyStepUp(actor: KeyActor, rawCode: unknown, req: Request): Promise<void> {
  const now = Date.now();
  for (const [k, exp] of usedCodes) if (exp <= now) usedCodes.delete(k);

  const fail = async (reason: "BAD_CODE" | "REPLAY" | "MFA_NOT_ENABLED") => {
    await writeAuditSafe({
      action: "API_KEY_STEPUP_FAILED",
      userId: actor.id,
      actorEmail: actor.email,
      metadata: { reason },
      req,
    });
    if (reason === "MFA_NOT_ENABLED") {
      throw new ApiKeyError(403, "Two-factor authentication must be enabled to manage API keys.", "STEP_UP_FAILED");
    }
    throw new ApiKeyError(403, "Invalid verification code.", "STEP_UP_FAILED");
  };

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { mfaEnabled: true, mfaSecret: true },
  });
  if (!user?.mfaEnabled || !user.mfaSecret) return fail("MFA_NOT_ENABLED");

  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!/^\d{6}$/.test(code)) return fail("BAD_CODE");

  const replayKey = `${actor.id}:${code}`;
  if (usedCodes.has(replayKey)) return fail("REPLAY");

  let valid = false;
  try {
    valid = verifySync({ token: code, secret: user.mfaSecret }).valid;
  } catch {
    valid = false;
  }
  if (!valid) return fail("BAD_CODE");

  usedCodes.set(replayKey, now + STEP_UP_REPLAY_MS);
}

// ─── Queries ────────────────────────────────────────────────────────────

export async function listKeys(includeAll: boolean) {
  const now = new Date();
  const since = new Date(now.getTime() - HISTORY_WINDOW_MS);
  const where: Prisma.ApiKeyWhereInput = includeAll
    ? {}
    : {
        OR: [
          { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: since } }] },
          { revokedAt: { gt: since } },
        ],
      };
  const [keys, activeCount] = await Promise.all([
    prisma.apiKey.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: "desc" } }),
    prisma.apiKey.count({ where: activeWhere(now) }),
  ]);
  const shaped = keys.map((k) => toListShape(k, now));
  // Active first, then newest first (stable sort keeps createdAt order).
  shaped.sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));
  return {
    keys: shaped,
    maxActive: MAX_ACTIVE_KEYS,
    activeCount,
    externalApiEnabled: EXTERNAL_API_ENABLED,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────

function isSerializationFailure(error: any): boolean {
  return (
    error?.code === "P2034" ||
    error?.cause?.originalCode === "40001" ||
    error?.meta?.driverAdapterError?.cause?.originalCode === "40001" ||
    /could not serialize/i.test(String(error?.message ?? ""))
  );
}

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

export async function createKey(actor: KeyActor, name: string, days: ExpiryDays, req: Request) {
  const run = () =>
    prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const activeCount = await tx.apiKey.count({ where: activeWhere(now) });
        if (activeCount >= MAX_ACTIVE_KEYS) {
          throw new ApiKeyError(
            409,
            `Maximum of ${MAX_ACTIVE_KEYS} active API keys. Revoke one to create another.`,
            "KEY_LIMIT",
          );
        }
        const taken = await tx.apiKey.findFirst({ where: { ...activeWhere(now), name }, select: { id: true } });
        if (taken) {
          throw new ApiKeyError(409, "An active key already has this name.", "NAME_TAKEN");
        }
        const { plaintext, keyHash, keyLast4 } = generateKey();
        const created = await tx.apiKey.create({
          data: {
            name,
            keyHash,
            keyLast4,
            scopes: [AUDIT_READ_SCOPE],
            createdById: actor.id,
            expiresAt: expiryDate(days, now),
          },
          include: LIST_INCLUDE,
        });
        await writeAudit(
          {
            action: "API_KEY_CREATED",
            userId: actor.id,
            actorEmail: actor.email,
            metadata: {
              apiKeyId: created.id,
              name: created.name,
              last4: created.keyLast4,
              scopes: created.scopes,
              expiresAt: created.expiresAt?.toISOString() ?? null,
            },
            req,
          },
          tx,
        );
        return { plaintext, created };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  let result;
  try {
    result = await run();
  } catch (error) {
    if (!isSerializationFailure(error)) throw error;
    try {
      result = await run();
    } catch (retryError) {
      if (!isSerializationFailure(retryError)) throw retryError;
      throw new ApiKeyError(409, "Another key change happened at the same moment. Try again.", "CONFLICT");
    }
  }

  const { plaintext, created } = result;
  notifyAdmins(
    "API key created",
    `${actor.name} created API key "${created.name}" (…${created.keyLast4}), expires ${fmtDate(created.expiresAt)}.`,
    "API_KEY_ALERT",
  );
  return { key: plaintext, apiKey: toListShape(created) };
}

/** `requestedDays` undefined = keep the old key's period (see inferExpiryDays). */
export async function regenerateKey(actor: KeyActor, id: string, requestedDays: ExpiryDays | undefined, req: Request) {
  const result = await prisma.$transaction(
    async (tx) => {
      const now = new Date();
      const old = await tx.apiKey.findUnique({ where: { id } });
      if (!old) throw new ApiKeyError(404, "API key not found.", "NOT_FOUND");
      if (keyStatus(old, now) !== "ACTIVE") {
        throw new ApiKeyError(409, "Only an active key can be regenerated.", "NOT_ACTIVE");
      }
      const days = requestedDays === undefined ? inferExpiryDays(old) : requestedDays;
      const { plaintext, keyHash, keyLast4 } = generateKey();
      const created = await tx.apiKey.create({
        data: {
          name: old.name,
          keyHash,
          keyLast4,
          scopes: old.scopes,
          createdById: actor.id,
          expiresAt: expiryDate(days, now),
        },
        include: LIST_INCLUDE,
      });
      // Conditional on revokedAt still being null, so two concurrent
      // regenerates can't both succeed on the same key.
      const revoked = await tx.apiKey.updateMany({
        where: { id: old.id, revokedAt: null },
        data: { revokedAt: now, revokedById: actor.id, replacedById: created.id },
      });
      if (revoked.count !== 1) {
        throw new ApiKeyError(409, "Only an active key can be regenerated.", "NOT_ACTIVE");
      }
      await writeAudit(
        {
          action: "API_KEY_REGENERATED",
          userId: actor.id,
          actorEmail: actor.email,
          metadata: {
            oldApiKeyId: old.id,
            newApiKeyId: created.id,
            name: created.name,
            last4: created.keyLast4,
            expiresAt: created.expiresAt?.toISOString() ?? null,
          },
          req,
        },
        tx,
      );
      return { plaintext, created, oldLast4: old.keyLast4 };
    },
  );

  const { plaintext, created, oldLast4 } = result;
  notifyAdmins(
    "API key regenerated",
    `${actor.name} regenerated API key "${created.name}" (…${oldLast4} → …${created.keyLast4}), expires ${fmtDate(created.expiresAt)}. The old key stopped working immediately.`,
    "API_KEY_ALERT",
  );
  return { key: plaintext, apiKey: toListShape(created) };
}

/** Idempotent: revoking an already-revoked key returns it unchanged with no new audit row. */
export async function revokeKey(actor: KeyActor, id: string, req: Request) {
  const result = await prisma.$transaction(async (tx) => {
    const key = await tx.apiKey.findUnique({ where: { id } });
    if (!key) throw new ApiKeyError(404, "API key not found.", "NOT_FOUND");
    if (key.revokedAt) return { changed: false, key };
    const updated = await tx.apiKey.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });
    if (updated.count === 0) return { changed: false, key };
    await writeAudit(
      {
        action: "API_KEY_REVOKED",
        userId: actor.id,
        actorEmail: actor.email,
        metadata: { apiKeyId: key.id, name: key.name, last4: key.keyLast4 },
        req,
      },
      tx,
    );
    return { changed: true, key };
  });

  if (result.changed) {
    notifyAdmins(
      "API key revoked",
      `${actor.name} revoked API key "${result.key.name}" (…${result.key.keyLast4}). Requests using it are now rejected.`,
      "API_KEY_ALERT",
    );
  }
  const fresh = await prisma.apiKey.findUniqueOrThrow({ where: { id }, include: LIST_INCLUDE });
  return { apiKey: toListShape(fresh) };
}

// ─── Used by the external API middleware ────────────────────────────────

const LAST_USED_THROTTLE_MS = 60 * 1000;
const lastUsedWrites = new Map<string, number>();

/** Updates lastUsedAt at most once a minute per key. Fire-and-forget; never fails the request. */
export function touchLastUsed(id: string): void {
  const now = Date.now();
  if (now - (lastUsedWrites.get(id) ?? 0) < LAST_USED_THROTTLE_MS) return;
  lastUsedWrites.set(id, now);
  prisma.apiKey
    .update({ where: { id }, data: { lastUsedAt: new Date(now) } })
    .catch((error) => console.error("[ExternalAudit] lastUsedAt update failed:", error?.message ?? error));
}

// ─── Cron ───────────────────────────────────────────────────────────────

/** Daily: warn admins once per key, 7 days before it expires. */
export async function checkApiKeyExpiry(): Promise<void> {
  try {
    const now = new Date();
    const soon = await prisma.apiKey.findMany({
      where: {
        revokedAt: null,
        expiryWarnedAt: null,
        expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRY_WARNING_MS) },
      },
    });
    for (const k of soon) {
      // Claim first so a restart mid-loop can't send the warning twice.
      const claimed = await prisma.apiKey.updateMany({
        where: { id: k.id, expiryWarnedAt: null },
        data: { expiryWarnedAt: now },
      });
      if (claimed.count === 0) continue;
      notifyAdmins(
        "API key expiring soon",
        `API key "${k.name}" (…${k.keyLast4}) expires on ${fmtDate(k.expiresAt)}. OrkaSecurity monitoring will stop on that date unless the key is regenerated.`,
        "API_KEY_ALERT",
      );
    }
    if (soon.length > 0) console.log(`[Cron] API key expiry warnings sent for ${soon.length} key(s).`);
  } catch (error) {
    console.error("[Cron] API key expiry check failed:", error);
  }
}
