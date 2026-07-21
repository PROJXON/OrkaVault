/**
 * Workspace Activity Routes — read-only view of ingested Google Workspace
 * login/OAuth-grant events (see services/googleWorkspace.ts).
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

// GET /api/workspace-activity — list ingested events with filters [ADMIN]
router.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { eventType, userEmail, flagged, limit } = req.query;
    const where: any = {};
    if (eventType) where.eventType = eventType as string;
    if (userEmail) where.userEmail = userEmail as string;
    if (flagged !== undefined) where.flagged = flagged === "true";

    try {
      const events = await prisma.workspaceActivityEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        take: Math.min(parseInt(limit as string) || 100, 500),
      });
      res.json(events);
    } catch (error) {
      console.error("[WorkspaceActivity]", error);
      res.status(500).json({ error: "Failed to fetch workspace activity." });
    }
  },
);

export default router;
