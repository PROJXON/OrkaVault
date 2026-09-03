/**
 * Access Request Routes — Submit, Approve (with race-condition lock), Deny
 */
import { Router, Response } from "express";
import { prisma } from "../lib/prismaClient";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/auth";
import { notifyManagersAndAdmins } from "../services/notifications";
import { meetsClearance } from "../services/clearance";
import { sendChatAlert } from "../services/webhookAlerts";
import { approveAccessRequest, denyAccessRequest, RequestActionError } from "../services/accessRequests";
import { asString, clientIp } from "../utils/reqValue";

const router = Router();

// GET /api/requests — list requests filtered by role
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const isMyRequests = req.query.type === "my";
      if (req.user!.role === "USER" || isMyRequests) {
        const requests = await prisma.accessRequest.findMany({
          where: { requesterId: req.user!.id },
          include: {
            account: {
              select: {
                id: true,
                name: true,
                username: true,
                platformType: true,
              },
            },
          },
          orderBy: { submittedAt: "desc" },
        });
        res.json(requests);
      } else if (req.user!.role === "MANAGER") {
        // Scoped the same way as approve/deny (services/accessRequests.ts's
        // isInManagerScope) — a Manager only sees requests for accounts in
        // one of their assigned collections. Accounts with no collection
        // are out of scope for every manager, matching that same rule.
        const managedCollectionIds = req.user!.managedCollections.map((c: any) => c.id);
        const requests = await prisma.accessRequest.findMany({
          where: { account: { collectionId: { in: managedCollectionIds } } },
          include: {
            account: {
              select: {
                id: true,
                name: true,
                username: true,
                platformType: true,
              },
            },
            requester: { select: { id: true, name: true, email: true } },
          },
          orderBy: { submittedAt: "desc" },
        });
        res.json(requests);
      } else {
        // ADMIN — unrestricted.
        const requests = await prisma.accessRequest.findMany({
          include: {
            account: {
              select: {
                id: true,
                name: true,
                username: true,
                platformType: true,
              },
            },
            requester: { select: { id: true, name: true, email: true } },
          },
          orderBy: { submittedAt: "desc" },
        });
        res.json(requests);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch requests." });
    }
  },
);

// GET /api/requests/last-approved/:accountId — get last approved request for this account by user
router.get(
  "/last-approved/:accountId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await prisma.accessRequest.findFirst({
        where: {
          accountId: asString(req.params.accountId),
          requesterId: req.user!.id,
          status: "APPROVED",
        },
        orderBy: { submittedAt: "desc" },
      });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch last approved request." });
    }
  }
);

// POST /api/requests — submit new access request [ALL]
router.post(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { accountId, requestType, reason, deviceName, location, internationalAccessRequested } = req.body;
    if (!accountId || !requestType || !reason || !deviceName) {
      res
        .status(400)
        .json({ error: "accountId, requestType, reason, and deviceName are required." });
      return;
    }

    try {
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      if (
        req.user!.role !== "ADMIN" &&
        !meetsClearance(req.user!.clearanceLevel, account.requiredClearance)
      ) {
        res.status(403).json({
          error: "Your clearance level is insufficient to request this account.",
        });
        return;
      }

      // Check if pending request already exists
      const existing = await prisma.accessRequest.findFirst({
        where: { accountId, requesterId: req.user!.id, status: "PENDING" },
      });
      if (existing) {
        res.status(400).json({
          error: "You already have a pending request for this account.",
        });
        return;
      }

      const request = await prisma.accessRequest.create({
        data: { 
          accountId, 
          requesterId: req.user!.id, 
          requestType, 
          reason,
          deviceName,
          location: location || null,
          internationalAccessRequested: internationalAccessRequested === true
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId,
          action: "ACCESS_REQUESTED",
          ipAddress: clientIp(req),
        },
      });

      // Notify managers and admins (account already loaded above)
      const requestTypeLabels: Record<string, string> = {
        VIEW_90S: "Single View (90s)",
        TEMP_24H: "Temporary (24h)",
        ONGOING: "Indefinite",
      };
      const label = requestTypeLabels[requestType] || requestType;
      notifyManagersAndAdmins(
        "New Access Request",
        `${req.user!.name} requested ${label} access to "${account?.name || accountId}".`,
        "ACCESS_REQUEST",
      );
      sendChatAlert("ACCESS_REQUESTED", {
        requesterName: req.user!.name,
        accountName: account?.name || accountId,
        requestTypeLabel: label,
        requestId: request.id,
        reason: request.reason,
      });

      res.status(201).json(request);
    } catch (error) {
      console.error("[Request Create]", error);
      res.status(500).json({ error: "Failed to create request." });
    }
  },
);

// PATCH /api/requests/:id/approve — approve + create grant [MANAGER+]
// BUG 1 DEFENSE: SELECT FOR UPDATE to prevent race condition
router.patch(
  "/:id/approve",
  requireAuth,
  requireRole("MANAGER", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await approveAccessRequest(req.user!, asString(req.params.id)!, clientIp(req), "web");
      res.json({
        message: "Request approved and grant provisioned.",
        grantId: result.grantId,
      });
    } catch (error: any) {
      if (error instanceof RequestActionError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403;
        res.status(status).json({ error: error.message });
      } else {
        console.error("[Approve]", error);
        res.status(500).json({ error: "Failed to approve request." });
      }
    }
  },
);

// PATCH /api/requests/:id/deny — deny request [MANAGER+]
// Uses SELECT FOR UPDATE to prevent race condition (consistent with approve)
router.patch(
  "/:id/deny",
  requireAuth,
  requireRole("MANAGER", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    try {
      await denyAccessRequest(req.user!, asString(req.params.id)!, reason, clientIp(req), "web");
      res.json({ message: "Request denied." });
    } catch (error: any) {
      if (error instanceof RequestActionError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403;
        res.status(status).json({ error: error.message });
      } else {
        console.error("[Deny]", error);
        res.status(500).json({ error: "Failed to deny request." });
      }
    }
  },
);

export default router;
