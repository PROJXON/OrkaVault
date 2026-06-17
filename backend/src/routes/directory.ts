import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        clearanceLevel: true,
        internationalAccess: true,
        devices: true,
        accessGrants: {
          where: { active: true },
          select: {
            id: true,
            accountId: true,
            expiresAt: true,
            account: { select: { name: true } },
          },
        },
      },
    });

    const totalPersonnel = users.length;
    const internationalAccess = users.filter((u) => u.internationalAccess).length;

    // Health Data
    const accounts = await prisma.account.findMany({
      select: { healthScore: true, healthLabel: true },
    });
    
    let totalHealth = 0;
    const healthDistribution = { STRONG: 0, MEDIUM: 0, WEAK: 0 };
    accounts.forEach((acc) => {
      totalHealth += acc.healthScore;
      healthDistribution[acc.healthLabel] = (healthDistribution[acc.healthLabel] || 0) + 1;
    });
    const avgHealthScore = accounts.length > 0 ? Math.round(totalHealth / accounts.length) : 0;

    // Audit Data (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentLogs = await prisma.auditLog.findMany({
      where: { timestamp: { gte: sevenDaysAgo } },
      select: { timestamp: true },
    });
    
    const auditActivity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d.toISOString().split("T")[0],
        count: 0
      };
    });

    recentLogs.forEach(log => {
      const dateStr = log.timestamp.toISOString().split("T")[0];
      const day = auditActivity.find(a => a.date === dateStr);
      if (day) day.count++;
    });

    res.json({
      metrics: {
        totalPersonnel,
        internationalAccess,
        avgHealthScore,
        sevenDayAuditCount: recentLogs.length,
        healthDistribution,
        auditActivity,
      },
      users: users.map((user) => {
        // Deduplicate resources by accountId — a user may have multiple grants for the same account
        // Keep the most recent (first encountered) grant per account
        const uniqueResources = new Map<string, { id: string; name: string; accessType: string; expiresAt: Date | null }>();
        user.accessGrants.forEach((grant) => {
          if (!uniqueResources.has(grant.accountId)) {
            uniqueResources.set(grant.accountId, {
              id: grant.id,
              name: grant.account.name,
              accessType: (grant as any).accessType || "ONGOING",
              expiresAt: grant.expiresAt,
            });
          }
        });
        return {
          ...user,
          resources: Array.from(uniqueResources.values()),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
