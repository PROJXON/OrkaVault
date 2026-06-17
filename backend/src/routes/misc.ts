/**
 * Grants, Notifications, Audit, Health Routes
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/auth";
import { scorePassword } from "../services/health";
import { fetchSecret } from "../services/secretManager";

const prisma = new PrismaClient();
const router = Router();

// ─── GRANTS ────────────────────────────────────────────────────────────

// GET /api/grants/me — list my active grants
router.get(
  "/grants/me",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const grants = await prisma.accessGrant.findMany({
      where: { userId: req.user!.id, active: true },
      include: {
        account: {
          select: { id: true, name: true, username: true, platformType: true },
        },
      },
      orderBy: { grantedAt: "desc" },
    });
    res.json(grants);
  },
);

// PATCH /api/grants/:id — update grant access type [ADMIN]
router.patch(
  "/grants/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { accessType } = req.body;
    const validTypes = ["VIEW_90S", "TEMP_24H", "ONGOING"];
    if (!validTypes.includes(accessType)) {
      res.status(400).json({ error: "accessType must be VIEW_90S, TEMP_24H, or ONGOING." });
      return;
    }

    const grant = await prisma.accessGrant.findUnique({
      where: { id: req.params.id },
    });
    if (!grant || !grant.active) {
      res.status(404).json({ error: "Active grant not found." });
      return;
    }

    // ALWAYS set expiresAt to null when changing access type so the timer resets
    // and only starts counting down when the user clicks the eye button!
    let expiresAt: Date | null = null;

    const updated = await prisma.accessGrant.update({
      where: { id: req.params.id },
      data: { accessType, expiresAt },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        accountId: grant.accountId,
        action: "GRANT_UPDATED",
        metadata: { accessType },
        ipAddress: req.ip,
      },
    });

    res.json({ message: "Grant updated.", grant: updated });
  },
);

// DELETE /api/grants/:id — revoke grant [ADMIN / grant owner]
router.delete(
  "/grants/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const grant = await prisma.accessGrant.findUnique({
      where: { id: req.params.id },
    });
    if (!grant) {
      res.status(404).json({ error: "Grant not found." });
      return;
    }

    if (req.user!.role !== "ADMIN" && grant.grantedBy !== req.user!.id) {
      res
        .status(403)
        .json({ error: "Only admins or the grant issuer can revoke." });
      return;
    }

    await prisma.accessGrant.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        accountId: grant.accountId,
        action: "GRANT_REVOKED",
        ipAddress: req.ip,
      },
    });
    res.json({ message: "Grant revoked." });
  },
);

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────

// GET /api/notifications — get my notifications
router.get(
  "/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json(notifications);
  },
);

// PATCH /api/notifications/read-all — mark all as read
// IMPORTANT: must be registered BEFORE /:id/read to avoid Express matching "read-all" as an :id
router.patch(
  "/notifications/read-all",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    res.json({ message: "All marked as read." });
  },
);

// PATCH /api/notifications/:id/read — mark one as read
router.patch(
  "/notifications/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ message: "Marked as read." });
  },
);

// ─── AUDIT LOG ──────────────────────────────────────────────────────────

// GET /api/audit — get audit log with filters [ADMIN]
router.get(
  "/audit",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { action, userId, accountId, limit } = req.query;
    const where: any = {};
    if (action) where.action = action as string;
    if (userId) where.userId = userId as string;
    if (accountId) where.accountId = accountId as string;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "desc" },
      take: Math.min(parseInt(limit as string) || 100, 500),
    });
    res.json(logs);
  },
);

// ─── HEALTH ─────────────────────────────────────────────────────────────

// GET /api/health/scores — all accounts with health scores [ADMIN]
router.get(
  "/health/scores",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const accounts = await prisma.account.findMany({
      where: { qaStatus: "APPROVED" },
      select: {
        id: true,
        name: true,
        username: true,
        healthScore: true,
        healthLabel: true,
        nextRotationDue: true,
      },
      orderBy: { healthScore: "asc" },
    });
    res.json(accounts);
  },
);

// POST /api/health/check/:id — re-score a password [MANAGER+]
router.post(
  "/health/check/:id",
  requireAuth,
  requireRole("MANAGER", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      const password = await fetchSecret(account.secretRef);
      const { score, label } = scorePassword(password);

      await prisma.account.update({
        where: { id: req.params.id },
        data: { healthScore: score, healthLabel: label },
      });

      res.json({
        id: account.id,
        name: account.name,
        healthScore: score,
        healthLabel: label,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to re-score password." });
    }
  },
);

export default router;
