/**
 * Workspace Activity Routes — read-only view of ingested Google Workspace
 * login/OAuth-grant events (see services/googleWorkspace.ts).
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { syncConnectedApps, syncConnectedAppsForUser, listActiveWorkspaceUsers } from "../services/googleWorkspace";

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

// GET /api/workspace-activity/connected-apps — current per-user connected
// third-party OAuth apps (snapshot, not an event log — see ConnectedApp /
// services/googleWorkspace.ts's syncConnectedApps) [ADMIN]
router.get(
  "/connected-apps",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { userEmail } = req.query;
    const where: any = {};
    if (userEmail) where.userEmail = userEmail as string;

    try {
      const apps = await prisma.connectedApp.findMany({
        where,
        orderBy: [{ userEmail: "asc" }, { appName: "asc" }],
      });
      res.json(apps);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to fetch connected apps." });
    }
  },
);

// GET /api/workspace-activity/connected-apps/users — list active Workspace
// accounts with their already-synced app count (fast: one paginated
// Directory API users.list call + one grouped DB query, no per-user
// tokens.list). Lets the frontend show every account up front without
// syncing all of them, then sync just the one the admin clicks. [ADMIN]
router.get(
  "/connected-apps/users",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [workspaceUsers, counts] = await Promise.all([
        listActiveWorkspaceUsers(),
        prisma.connectedApp.groupBy({ by: ["userEmail"], _count: { _all: true } }),
      ]);
      const countByEmail = new Map(counts.map((c) => [c.userEmail, c._count._all]));
      const users = workspaceUsers
        .map(({ email }) => ({ userEmail: email, appCount: countByEmail.get(email) ?? 0 }))
        .sort((a, b) => a.userEmail.localeCompare(b.userEmail));
      res.json(users);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to list Workspace accounts." });
    }
  },
);

// GET /api/workspace-activity/connected-apps/top — the most-connected
// third-party apps org-wide, by how many accounts have them (reads cached
// ConnectedApp rows only, no live Google call). Grouped by appName,
// falling back to clientId when Google didn't report a display name, so
// the same app isn't split across two buckets by a missing name. [ADMIN]
router.get(
  "/connected-apps/top",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    try {
      const all = await prisma.connectedApp.findMany({ select: { appName: true, clientId: true } });
      const counts = new Map<string, number>();
      for (const app of all) {
        const key = app.appName || app.clientId;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      res.json(top);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to compute top connected apps." });
    }
  },
);

// POST /api/workspace-activity/connected-apps/sync — runs syncConnectedApps()
// for every active user (a no-op if Workspace monitoring isn't configured),
// then returns all rows. Slow on a large org (one tokens.list call per
// user) — kept as a manual "sync everything" escape hatch; the Connected
// Apps tab itself uses the per-user route below instead. [ADMIN]
router.post(
  "/connected-apps/sync",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await syncConnectedApps();
      const apps = await prisma.connectedApp.findMany({
        orderBy: [{ userEmail: "asc" }, { appName: "asc" }],
      });
      res.json(apps);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to sync connected apps." });
    }
  },
);

// POST /api/workspace-activity/connected-apps/sync/:userEmail — on-demand
// sync for a single user (one tokens.list call) — used when the admin
// clicks an account in the Connected Apps tab. [ADMIN]
router.post(
  "/connected-apps/sync/:userEmail",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const apps = await syncConnectedAppsForUser(req.params.userEmail);
      res.json(apps);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to sync connected apps for user." });
    }
  },
);

export default router;
