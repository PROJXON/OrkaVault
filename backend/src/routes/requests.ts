/**
 * Access Request Routes — Submit, Approve (with race-condition lock), Deny
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/auth";
import { notifyUser, notifyManagersAndAdmins } from "../services/notifications";

const prisma = new PrismaClient();
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
      } else {
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
          ipAddress: req.ip,
        },
      });

      // Notify managers and admins
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
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
    const requestId = req.params.id;
    const managerId = req.user!.id;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // BUG 1: Lock the row and check status atomically
        const requests = await tx.$queryRaw<
          Array<{
            id: string;
            accountId: string;
            requesterId: string;
            requestType: string;
            status: string;
            deviceName: string | null;
            location: string | null;
            internationalAccessRequested: boolean;
          }>
        >`
        SELECT id, "accountId", "requesterId", "requestType", status, "deviceName", "location", "internationalAccessRequested" 
        FROM "AccessRequest" 
        WHERE id = ${requestId} 
        FOR UPDATE
      `;

        if (!requests.length || requests[0].status !== "PENDING") {
          throw new Error("CONFLICT");
        }

        const request = requests[0];

        // All grants start with an infinite activation window.
        // They will be shrunk down to 90s or 24h upon first reveal.
        let expiresAt: Date | null = null;
        // ONGOING = null expiresAt

        // Atomic: update request + create grant + audit log
        await tx.accessRequest.update({
          where: { id: requestId },
          data: {
            status: "APPROVED",
            actionedBy: managerId,
            actionedAt: new Date(),
          },
        });

        // Update user if deviceName or internationalAccessRequested is present
        if (request.deviceName || request.internationalAccessRequested) {
          const user = await tx.user.findUnique({ where: { id: request.requesterId } });
          if (user) {
            const updateData: any = {};
            if (request.internationalAccessRequested && !user.internationalAccess) {
              updateData.internationalAccess = true;
            }
            if (request.deviceName && !user.devices.includes(request.deviceName)) {
              updateData.devices = { push: request.deviceName };
            }
            if (Object.keys(updateData).length > 0) {
              await tx.user.update({
                where: { id: request.requesterId },
                data: updateData
              });
            }
          }
        }

        const grant = await tx.accessGrant.create({
          data: {
            accountId: request.accountId,
            userId: request.requesterId,
            grantedBy: managerId,
            accessType: request.requestType,
            expiresAt,
            active: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: managerId,
            accountId: request.accountId,
            action: "ACCESS_APPROVED",
            metadata: { requestId, requestType: request.requestType },
            ipAddress: req.ip,
          },
        });

        return {
          grant,
          requesterId: request.requesterId,
          accountId: request.accountId,
        };
      });

      // Notify requester (non-blocking, outside transaction)
      const account = await prisma.account.findUnique({
        where: { id: result.accountId },
      });
      notifyUser(
        result.requesterId,
        "Access Request Approved",
        `Your access request for "${account?.name}" has been approved.`,
        "ACCESS_APPROVED",
      );

      res.json({
        message: "Request approved and grant provisioned.",
        grantId: result.grant.id,
      });
    } catch (error: any) {
      if (error.message === "CONFLICT") {
        res
          .status(409)
          .json({ error: "This request has already been actioned." });
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
    const requestId = req.params.id;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Lock the row and check status atomically
        const requests = await tx.$queryRaw<
          Array<{ id: string; accountId: string; requesterId: string; status: string }>
        >`
          SELECT id, "accountId", "requesterId", status
          FROM "AccessRequest"
          WHERE id = ${requestId}
          FOR UPDATE
        `;

        if (!requests.length || requests[0].status !== "PENDING") {
          throw new Error("CONFLICT");
        }

        const request = requests[0];

        await tx.accessRequest.update({
          where: { id: requestId },
          data: {
            status: "DENIED",
            actionedBy: req.user!.id,
            actionedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            accountId: request.accountId,
            action: "ACCESS_DENIED",
            metadata: { reason },
            ipAddress: req.ip,
          },
        });

        return { requesterId: request.requesterId };
      });

      notifyUser(
        result.requesterId,
        "Access Request Denied",
        `Your access request has been denied. Reason: ${reason || "Not provided"}`,
        "ACCESS_DENIED",
      );
      res.json({ message: "Request denied." });
    } catch (error: any) {
      if (error.message === "CONFLICT") {
        res.status(409).json({ error: "This request has already been actioned." });
      } else {
        console.error("[Deny]", error);
        res.status(500).json({ error: "Failed to deny request." });
      }
    }
  },
);

export default router;
