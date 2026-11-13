/**
 * The one write path for AuditLog rows (Phase 4c §2).
 *
 * - `action` is typed against config/auditActions.ts, so a typo or an
 *   uncatalogued action fails `tsc`.
 * - Stamps the actorEmail / accountName snapshots so a row still says who
 *   and what after the user or account FK is nulled by a delete.
 * - ipAddress comes from clientIp(req).
 *
 * Two modes:
 * - writeAudit(): throws on failure. Use it for state-change audits that
 *   must be all-or-nothing with the change (pass the transaction client).
 * - writeAuditSafe(): never throws (logs instead). Use it for security
 *   events (logins, failures) where a failed audit write must not turn the
 *   response into a 500.
 *
 * METADATA RULE: never put secrets, password or OTP values, tokens,
 * custom-field values or key material in metadata. Field *names* and
 * labels are fine.
 */
import type { Request } from "express";
import { prisma, Prisma, PrismaClient } from "../lib/prismaClient";
import type { AuditAction } from "../config/auditActions";
import { clientIp } from "../utils/reqValue";

export type AuditClient = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  accountId?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
  /** Used only when `req` isn't available (services that receive the IP as a string). */
  ipAddress?: string | null;
  actorEmail?: string | null;
  accountName?: string | null;
}

const ipOf = (input: AuditInput) => (input.req ? clientIp(input.req) : input.ipAddress ?? null);

async function buildData(input: AuditInput, client: AuditClient): Promise<Prisma.AuditLogUncheckedCreateInput> {
  let actorEmail = input.actorEmail ?? null;
  if (!actorEmail && input.userId) {
    const u = await client.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    actorEmail = u?.email ?? null;
  }
  let accountName = input.accountName ?? null;
  if (!accountName && input.accountId) {
    const a = await client.account.findUnique({ where: { id: input.accountId }, select: { name: true } });
    accountName = a?.name ?? null;
  }
  return auditRow({ ...input, actorEmail, accountName });
}

/** Writes one audit row. Throws on failure (use inside transactions). */
export async function writeAudit(input: AuditInput, client: AuditClient = prisma): Promise<void> {
  await client.auditLog.create({ data: await buildData(input, client) });
}

/** Writes one audit row and never throws. For security events outside a transaction. */
export async function writeAuditSafe(input: AuditInput): Promise<void> {
  try {
    await writeAudit(input, prisma);
  } catch (error) {
    console.error(`[Audit] Failed to write ${input.action}:`, error);
  }
}

/**
 * Builds one row's data synchronously, with no lookups: the snapshots must
 * be passed in. For array-style `$transaction([...])` and createMany, where
 * the async writeAudit() can't be used.
 */
export function auditRow(input: AuditInput): Prisma.AuditLogUncheckedCreateInput & Prisma.AuditLogCreateManyInput {
  return {
    action: input.action,
    userId: input.userId ?? null,
    accountId: input.accountId ?? null,
    metadata: input.metadata as Prisma.InputJsonValue | undefined,
    ipAddress: ipOf(input),
    actorEmail: input.actorEmail ?? null,
    accountName: input.accountName ?? null,
  };
}

/** auditRow() for a list, for createMany (bulk actions). */
export function auditRows(inputs: AuditInput[]): Prisma.AuditLogCreateManyInput[] {
  return inputs.map(auditRow);
}

/** Trims and caps a user-supplied email for LOGIN_FAILED / ADMIN_SETUP_FAILED metadata. */
export function attemptedEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v ? v.slice(0, 254) : undefined;
}
