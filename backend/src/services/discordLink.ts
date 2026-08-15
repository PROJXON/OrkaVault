/**
 * Short-lived one-time codes for linking a Discord account to an OrkaVault
 * User (Profile.jsx "Link Discord" button -> Discord `/orkavault link
 * <code>`). In-memory, same fallback pattern as services/redis.ts's JTI
 * cache — a lost code on server restart just means the user generates a
 * new one, so this doesn't need Redis/DB durability.
 */
import crypto from "crypto";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const codes = new Map<string, { userId: string; expiresAt: number }>();

function cleanExpired() {
  const now = Date.now();
  for (const [code, entry] of codes.entries()) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}

/** Generates a fresh one-time code for the given user, replacing any prior unused code. */
export function createLinkCode(userId: string): string {
  cleanExpired();
  for (const [code, entry] of codes.entries()) {
    if (entry.userId === userId) codes.delete(code);
  }
  const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. "A1B2C3D4"
  codes.set(code, { userId, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

/** Consumes a code (single use) and returns the userId it was issued for, or null if invalid/expired. */
export function consumeLinkCode(code: string): string | null {
  cleanExpired();
  const entry = codes.get(code.trim().toUpperCase());
  if (!entry) return null;
  codes.delete(code.trim().toUpperCase());
  return entry.userId;
}
