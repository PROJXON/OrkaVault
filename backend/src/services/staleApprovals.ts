/**
 * Sweeps AccessGrants that were approved but never viewed within their 24h
 * "must view by" deadline (see services/accessRequests.ts's approveAccessRequest,
 * which sets that deadline, and routes/accounts.ts's reveal/reveal-otp, which
 * replace it with the real access window on first view). Left unrevealed
 * past the deadline, the grant is deactivated and the user has to submit a
 * new request — approved-but-unused access shouldn't sit around indefinitely.
 */
import { prisma } from "../lib/prismaClient";
import { notifyUser } from "./notifications";

export async function expireStaleApprovals(): Promise<void> {
  const stale = await prisma.accessGrant.findMany({
    where: { active: true, firstRevealedAt: null, expiresAt: { lte: new Date() } },
    include: { account: { select: { name: true } } },
  });
  if (stale.length === 0) return;

  await prisma.accessGrant.updateMany({
    where: { id: { in: stale.map((g) => g.id) } },
    data: { active: false },
  });

  await Promise.allSettled(
    stale.map((g) =>
      notifyUser(
        g.userId,
        "Access Approval Expired",
        `Your approved access to "${g.account.name}" expired because it wasn't viewed within 24 hours. Please submit a new request.`,
        "ACCESS_APPROVAL_EXPIRED",
      ),
    ),
  );

  console.log(`[StaleApprovals] Expired ${stale.length} unviewed approval(s).`);
}
