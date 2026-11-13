/**
 * Read-only external audit log API for OrkaSecurity (Phase 4c §4).
 * Mounted at /api/external/v1/audit.
 *
 * Auth is a service API key only (middleware/apiKey.ts): never requireAuth,
 * never cookies. Non-GET methods are already stopped by the global CSRF
 * check (this path is deliberately not CSRF-exempt).
 */
import { Router, Response } from "express";
import { prisma, Prisma } from "../lib/prismaClient";
import { externalApiGate, noStore, requireApiKey, ApiKeyRequest } from "../middleware/apiKey";
import { externalAuthFailLimiter, externalAuditLimiter } from "../middleware/rateLimit";
import { AUDIT_READ_SCOPE } from "../services/apiKeys";
import { getRetentionDays } from "../services/auditBackup";

const router = Router();

// Order matters: the kill switch first, so a disabled API leaks nothing
// (not even rate-limit headers).
router.use(externalApiGate);
router.use(noStore);
router.use(externalAuthFailLimiter);
router.use(requireApiKey(AUDIT_READ_SCOPE));
router.use(externalAuditLimiter);

// A row can get its seq inside a transaction that commits after a
// higher-seq row is already visible. Only returning rows older than this
// keeps a poll from moving its cursor past a row it never saw.
const SETTLE_WINDOW_MS = 30 * 1000;
const MAX_INT4 = 2147483647;
const ALLOWED_PARAMS = new Set(["after", "limit", "action"]);
const ACTION_FORMAT = /^[A-Za-z_]{1,64}$/;

class QueryError extends Error {}

function parseQuery(query: Record<string, unknown>) {
  for (const k of Object.keys(query)) {
    if (!ALLOWED_PARAMS.has(k)) throw new QueryError(`Unknown query parameter: ${k}`);
  }
  const single = (name: string): string | undefined => {
    const v = query[name];
    if (v === undefined) return undefined;
    if (typeof v !== "string") throw new QueryError(`${name} must be given once.`);
    return v;
  };
  const int = (name: string, min: number, max: number, dflt: number) => {
    const raw = single(name);
    if (raw === undefined) return dflt;
    if (!/^\d{1,10}$/.test(raw)) throw new QueryError(`${name} must be an integer.`);
    const n = Number(raw);
    if (n < min || n > max) throw new QueryError(`${name} must be between ${min} and ${max}.`);
    return n;
  };

  const after = int("after", 0, MAX_INT4, 0);
  const limit = int("limit", 1, 1000, 500);
  const rawAction = single("action");
  let actions: string[] | undefined;
  if (rawAction !== undefined) {
    actions = rawAction.split(",");
    if (actions.length > 100 || actions.some((a) => !ACTION_FORMAT.test(a))) {
      throw new QueryError("action must be a comma-separated list of action names.");
    }
  }
  return { after, limit, actions };
}

const ITEM_SELECT = {
  seq: true,
  id: true,
  timestamp: true,
  action: true,
  userId: true,
  accountId: true,
  ipAddress: true,
  metadata: true,
  actorEmail: true,
  accountName: true,
  user: { select: { id: true, name: true, email: true, department: true, role: true, active: true } },
  account: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogSelect;

// GET /api/external/v1/audit?after=<seq>&limit=<1-1000>&action=A,B
router.get("/", async (req: ApiKeyRequest, res: Response) => {
  let q;
  try {
    q = parseQuery(req.query as Record<string, unknown>);
  } catch (error) {
    if (error instanceof QueryError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const now = new Date();
    const rows = await prisma.auditLog.findMany({
      where: {
        seq: { gt: q.after },
        timestamp: { lt: new Date(now.getTime() - SETTLE_WINDOW_MS) },
        ...(q.actions && { action: { in: q.actions } }),
      },
      select: ITEM_SELECT,
      orderBy: { seq: "asc" },
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = items.length ? items[items.length - 1].seq : q.after;

    console.log(`[ExternalAudit] ok key=${req.apiKey!.name} path=/ rows=${items.length}`);
    res.json({ items, nextCursor, hasMore, serverTime: now.toISOString() });
  } catch (error) {
    console.error("[ExternalAudit] list failed:", error);
    res.status(500).json({ error: "Failed to read the audit log." });
  }
});

// GET /api/external/v1/audit/status — lets OrkaSecurity detect rows lost to
// retention before it read them (oldestSeq > its cursor + 1).
router.get("/status", async (req: ApiKeyRequest, res: Response) => {
  try {
    const [agg, retentionDays] = await Promise.all([
      prisma.auditLog.aggregate({ _min: { seq: true }, _max: { seq: true } }),
      getRetentionDays(),
    ]);
    console.log(`[ExternalAudit] ok key=${req.apiKey!.name} path=/status rows=0`);
    res.json({
      oldestSeq: agg._min.seq,
      newestSeq: agg._max.seq,
      retentionDays,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ExternalAudit] status failed:", error);
    res.status(500).json({ error: "Failed to read audit status." });
  }
});

// Anything else on this router. Only GET/HEAD/OPTIONS get this far (the
// global CSRF check rejects other methods first).
router.use((req, res) => {
  if (req.method === "GET" || req.method === "HEAD") {
    res.status(404).json({ error: "Not found." });
    return;
  }
  res.status(405).json({ error: "Method not allowed." });
});

export default router;
