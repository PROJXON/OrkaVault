/**
 * Workspace Activity Routes — read-only view of ingested Google Workspace
 * login/OAuth-grant events (see services/googleWorkspace.ts).
 */
import { Router, Response } from "express";
import { prisma } from "../lib/prismaClient";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { asString } from "../utils/reqValue";
import {
  syncConnectedApps,
  syncConnectedAppsForUser,
  listActiveWorkspaceUsers,
  syncWorkspaceDevices,
  syncWorkspaceDevicesForUser,
  syncWorkspaceRecovery,
  syncWorkspaceRecoveryForUser,
  inferLikelyDevice,
} from "../services/googleWorkspace";

const router = Router();

// Only login-type events get a device guess attached — an oauth_token_grant's
// IP/timing is often the third-party app's own server (see the note on
// WorkspaceActivityEvent.regionCode), not the user's device, so guessing a
// device there would be actively misleading rather than just approximate.
const LOGIN_EVENT_TYPES = new Set(["login_success", "login_failure", "suspicious_login"]);

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

      // Attach a best-effort "likely device" guess to login events only,
      // from whatever WorkspaceDevice data is already synced (no live
      // Google calls here — this route stays fast). See
      // inferLikelyDevice()'s comment for why this is a guess, not a fact.
      const loginUserEmails = [...new Set(events.filter((e) => LOGIN_EVENT_TYPES.has(e.eventType)).map((e) => e.userEmail))];
      const devices = loginUserEmails.length
        ? await prisma.workspaceDevice.findMany({ where: { userEmail: { in: loginUserEmails } } })
        : [];
      const devicesByUser = new Map<string, typeof devices>();
      for (const d of devices) {
        const list = devicesByUser.get(d.userEmail);
        if (list) list.push(d);
        else devicesByUser.set(d.userEmail, [d]);
      }

      const eventsWithInference = events.map((e) =>
        LOGIN_EVENT_TYPES.has(e.eventType)
          ? { ...e, inferredDevice: inferLikelyDevice(e.occurredAt, devicesByUser.get(e.userEmail) || []) }
          : e,
      );

      res.json(eventsWithInference);
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
      const apps = await syncConnectedAppsForUser(asString(req.params.userEmail)!);
      res.json(apps);
    } catch (error) {
      console.error("[ConnectedApps]", error);
      res.status(500).json({ error: "Failed to sync connected apps for user." });
    }
  },
);

// GET /api/workspace-activity/devices — current per-user device inventory
// (WorkspaceDevice, a snapshot from the Cloud Identity Devices API — not
// correlated to individual Activity Log rows, see services/googleWorkspace.ts
// on why Reports API login/token events can't carry per-event device info).
// Populated by the syncWorkspaceDevices cron. [ADMIN]
router.get(
  "/devices",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { userEmail } = req.query;
    const where: any = {};
    if (userEmail) where.userEmail = userEmail as string;

    try {
      const devices = await prisma.workspaceDevice.findMany({
        where,
        orderBy: [{ userEmail: "asc" }, { deviceType: "asc" }],
      });
      res.json(devices);
    } catch (error) {
      console.error("[WorkspaceDevices]", error);
      res.status(500).json({ error: "Failed to fetch workspace devices." });
    }
  },
);

// GET /api/workspace-activity/devices/users — fast list of every active
// Workspace account + its last-known device count (one users.list call +
// one grouped DB query, no live Cloud Identity calls) — mirrors
// /connected-apps/users. Backs the Devices tab's default (fast) view; the
// tab syncs an individual account only when it's expanded. [ADMIN]
router.get(
  "/devices/users",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [workspaceUsers, counts] = await Promise.all([
        listActiveWorkspaceUsers(),
        prisma.workspaceDevice.groupBy({ by: ["userEmail"], _count: { _all: true } }),
      ]);
      const countByEmail = new Map(counts.map((c) => [c.userEmail, c._count._all]));
      const users = workspaceUsers
        .map(({ email }) => ({ userEmail: email, deviceCount: countByEmail.get(email) ?? 0 }))
        .sort((a, b) => a.userEmail.localeCompare(b.userEmail));
      res.json(users);
    } catch (error) {
      console.error("[WorkspaceDevices]", error);
      res.status(500).json({ error: "Failed to list Workspace accounts." });
    }
  },
);

// POST /api/workspace-activity/devices/sync — manual full org resync.
// Slow (see services/googleWorkspace.ts on deviceUsers.list's 20-per-page
// cap) — kept as a manual "resync everything" escape hatch; the Devices
// tab itself uses the per-account route below instead. [ADMIN]
router.post(
  "/devices/sync",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await syncWorkspaceDevices();
      const devices = await prisma.workspaceDevice.findMany({
        orderBy: [{ userEmail: "asc" }, { deviceType: "asc" }],
      });
      res.json(devices);
    } catch (error) {
      console.error("[WorkspaceDevices]", error);
      res.status(500).json({ error: "Failed to sync workspace devices." });
    }
  },
);

// POST /api/workspace-activity/devices/sync/:userEmail — on-demand sync
// for a single account (filtered Cloud Identity calls, not a full org
// sweep) — used when the admin expands an account in the Devices tab. [ADMIN]
router.post(
  "/devices/sync/:userEmail",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const devices = await syncWorkspaceDevicesForUser(asString(req.params.userEmail)!);
      res.json(devices);
    } catch (error) {
      console.error("[WorkspaceDevices]", error);
      res.status(500).json({ error: "Failed to sync devices for user." });
    }
  },
);

// GET /api/workspace-activity/recovery — stored snapshot of the ADMIN-SET
// recovery email/phone on each Workspace account (WorkspaceRecoveryInfo —
// Directory API users.list/get, populated by syncWorkspaceRecovery). Not
// the user's own recovery info from myaccount.google.com, which Google
// exposes through no admin API. [ADMIN]
router.get(
  "/recovery",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { userEmail } = req.query;
    const where: any = {};
    if (userEmail) where.userEmail = userEmail as string;

    try {
      const rows = await prisma.workspaceRecoveryInfo.findMany({
        where,
        orderBy: { userEmail: "asc" },
      });
      res.json(rows);
    } catch (error) {
      console.error("[WorkspaceRecovery]", error);
      res.status(500).json({ error: "Failed to fetch workspace recovery info." });
    }
  },
);

// GET /api/workspace-activity/recovery/users — every active Workspace
// account left-joined with its stored recovery snapshot (one users.list
// call + one findMany, no per-user Google calls). Recovery info is a
// single scalar pair per account, so unlike the Devices/Connected Apps
// tabs this returns it inline — no expand-to-sync step. [ADMIN]
router.get(
  "/recovery/users",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [workspaceUsers, rows] = await Promise.all([
        listActiveWorkspaceUsers(),
        prisma.workspaceRecoveryInfo.findMany(),
      ]);
      const byEmail = new Map(rows.map((r) => [r.userEmail, r]));
      const users = workspaceUsers
        .map(({ email }) => {
          const row = byEmail.get(email);
          return {
            userEmail: email,
            recoveryEmail: row?.recoveryEmail ?? null,
            recoveryPhone: row?.recoveryPhone ?? null,
            lastSyncedAt: row?.lastSyncedAt ?? null,
          };
        })
        .sort((a, b) => a.userEmail.localeCompare(b.userEmail));
      res.json(users);
    } catch (error) {
      console.error("[WorkspaceRecovery]", error);
      res.status(500).json({ error: "Failed to list Workspace accounts." });
    }
  },
);

// POST /api/workspace-activity/recovery/sync — full org resync (one
// paginated users.list), then returns all rows. A no-op if Workspace
// monitoring isn't configured. [ADMIN]
router.post(
  "/recovery/sync",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await syncWorkspaceRecovery();
      const rows = await prisma.workspaceRecoveryInfo.findMany({ orderBy: { userEmail: "asc" } });
      res.json(rows);
    } catch (error) {
      console.error("[WorkspaceRecovery]", error);
      res.status(500).json({ error: "Failed to sync workspace recovery info." });
    }
  },
);

// POST /api/workspace-activity/recovery/sync/:userEmail — on-demand sync
// for a single account (one users.get) — the Recovery tab's per-row
// "Refresh". [ADMIN]
router.post(
  "/recovery/sync/:userEmail",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const row = await syncWorkspaceRecoveryForUser(asString(req.params.userEmail)!);
      res.json(row);
    } catch (error) {
      console.error("[WorkspaceRecovery]", error);
      res.status(500).json({ error: "Failed to sync recovery info for user." });
    }
  },
);

export default router;
