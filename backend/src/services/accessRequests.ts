/**
 * Shared approve/deny logic for AccessRequests — used by both the web
 * route (routes/requests.ts) and the chat-integration inbound routes
 * (routes/integrations/*) so the clearance/collection-scope checks and
 * side effects (grant creation, notifications, chat alerts, audit log)
 * can't drift between the two call paths.
 */
import { prisma, Role } from "../lib/prismaClient";
import { notifyUser } from "./notifications";
import { meetsClearance } from "./clearance";
import { sendChatAlert } from "./webhookAlerts";


export type RequestActor = {
  id: string;
  role: Role;
  managedCollections: { id: string }[];
};

/** Where the approve/deny call originated — recorded on the AuditLog row. */
export type ActionSource = "web" | "discord" | "gchat";

export class RequestActionError extends Error {
  code: "CONFLICT" | "FORBIDDEN" | "CLEARANCE" | "NOT_FOUND";
  constructor(code: RequestActionError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

// Same rule as middleware/auth.ts's isAccountInManagerScope, restated
// against the narrower RequestActor shape (id/role/managedCollections
// only) so callers don't need to fabricate a full AuthenticatedRequest["user"].
function isInManagerScope(actor: RequestActor, accountCollectionId: string | null): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "MANAGER") return false;
  if (!accountCollectionId) return false;
  return actor.managedCollections.some((c) => c.id === accountCollectionId);
}

export interface ApproveResult {
  grantId: string;
  requesterId: string;
  requesterName: string;
  accountId: string;
  accountName: string;
}

export async function approveAccessRequest(
  actor: RequestActor,
  requestId: string,
  ipAddress: string | undefined,
  source: ActionSource = "web",
): Promise<ApproveResult> {
  const result = await prisma.$transaction(async (tx) => {
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
      throw new RequestActionError("CONFLICT", "This request has already been actioned.");
    }
    const request = requests[0];

    const account = await tx.account.findUnique({
      where: { id: request.accountId },
      select: { name: true, collectionId: true, requiredClearance: true },
    });
    if (!account) {
      throw new RequestActionError("NOT_FOUND", "Account not found.");
    }

    if (!isInManagerScope(actor, account.collectionId)) {
      throw new RequestActionError("FORBIDDEN", "This account is outside your assigned collections.");
    }

    const requester = await tx.user.findUnique({ where: { id: request.requesterId } });
    if (!meetsClearance(requester?.clearanceLevel, account.requiredClearance)) {
      throw new RequestActionError("CLEARANCE", "The requester's clearance level is insufficient for this account.");
    }

    await tx.accessRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", actionedBy: actor.id, actionedAt: new Date() },
    });

    if ((request.deviceName || request.internationalAccessRequested) && requester) {
      const updateData: any = {};
      if (request.internationalAccessRequested && !requester.internationalAccess) {
        updateData.internationalAccess = true;
      }
      if (request.deviceName && !requester.devices.includes(request.deviceName)) {
        updateData.devices = { push: request.deviceName };
      }
      if (Object.keys(updateData).length > 0) {
        await tx.user.update({ where: { id: request.requesterId }, data: updateData });
      }
    }

    // All grants start with an infinite activation window; they're shrunk
    // down to 90s/24h upon first reveal.
    const grant = await tx.accessGrant.create({
      data: {
        accountId: request.accountId,
        userId: request.requesterId,
        grantedBy: actor.id,
        accessType: request.requestType,
        expiresAt: null,
        active: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        accountId: request.accountId,
        action: "ACCESS_APPROVED",
        metadata: { requestId, requestType: request.requestType, source },
        ipAddress,
      },
    });

    return {
      grantId: grant.id,
      requesterId: request.requesterId,
      requesterName: requester?.name || request.requesterId,
      accountId: request.accountId,
      accountName: account.name,
    };
  });

  notifyUser(
    result.requesterId,
    "Access Request Approved",
    `Your access request for "${result.accountName}" has been approved.`,
    "ACCESS_APPROVED",
  );
  sendChatAlert("ACCESS_APPROVED", {
    requesterName: result.requesterName,
    accountName: result.accountName,
  });

  return result;
}

export interface DenyResult {
  requesterId: string;
  requesterName: string;
  accountId: string;
  accountName: string;
}

export async function denyAccessRequest(
  actor: RequestActor,
  requestId: string,
  reason: string | undefined,
  ipAddress: string | undefined,
  source: ActionSource = "web",
): Promise<DenyResult> {
  const result = await prisma.$transaction(async (tx) => {
    const requests = await tx.$queryRaw<
      Array<{ id: string; accountId: string; requesterId: string; status: string }>
    >`
      SELECT id, "accountId", "requesterId", status
      FROM "AccessRequest"
      WHERE id = ${requestId}
      FOR UPDATE
    `;

    if (!requests.length || requests[0].status !== "PENDING") {
      throw new RequestActionError("CONFLICT", "This request has already been actioned.");
    }
    const request = requests[0];

    const account = await tx.account.findUnique({
      where: { id: request.accountId },
      select: { name: true, collectionId: true },
    });
    if (!account) {
      throw new RequestActionError("NOT_FOUND", "Account not found.");
    }

    if (!isInManagerScope(actor, account.collectionId)) {
      throw new RequestActionError("FORBIDDEN", "This account is outside your assigned collections.");
    }

    await tx.accessRequest.update({
      where: { id: requestId },
      data: { status: "DENIED", actionedBy: actor.id, actionedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        accountId: request.accountId,
        action: "ACCESS_DENIED",
        metadata: { reason, source },
        ipAddress,
      },
    });

    const requester = await tx.user.findUnique({ where: { id: request.requesterId } });
    return {
      requesterId: request.requesterId,
      requesterName: requester?.name || request.requesterId,
      accountId: request.accountId,
      accountName: account.name,
    };
  });

  notifyUser(
    result.requesterId,
    "Access Request Denied",
    `Your access request has been denied. Reason: ${reason || "Not provided"}`,
    "ACCESS_DENIED",
  );
  sendChatAlert("ACCESS_DENIED", {
    requesterName: result.requesterName,
    accountName: result.accountName,
    reason,
  });

  return result;
}
