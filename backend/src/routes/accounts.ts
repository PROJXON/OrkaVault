/**
 * Account Routes — CRUD, QA Approval, Reveal
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/auth";
import {
  storeSecret,
  fetchSecret,
  updateSecret,
  deleteSecret,
} from "../services/secretManager";
import { scorePassword } from "../services/health";
import { notifyAdmins, notifyUser } from "../services/notifications";

const prisma = new PrismaClient();
const router = Router();

// GET /api/accounts — list all APPROVED accounts [ALL active]
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accounts = await prisma.account.findMany({
      where: { qaStatus: "APPROVED" },
      include: {
        accessGrants: {
          where: {
            userId: req.user!.id,
            active: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        username: a.username,
        platformType: a.platformType,
        ownerId: a.ownerId,
        healthScore: a.healthScore,
        healthLabel: a.healthLabel,
        refreshCycle: a.refreshCycle,
        nextRotationDue: a.nextRotationDue,
        qaStatus: a.qaStatus,
        notes: a.notes,
        collectionId: a.collectionId,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        hasTotpQr: !!a.totpQrBase64,
        hasGrant: a.accessGrants.length > 0,
        grantExpiresAt: a.accessGrants[0]?.expiresAt || null,
      })),
    );
  },
);

// GET /api/accounts/:id — single account metadata [ALL active]
router.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        accessGrants: {
          where: { active: true },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    res.json({ ...account, secretRef: undefined });
  },
);

// POST /api/accounts — submit new entry to QA queue [MANAGER+]
// BUG 4 DEFENSE: duplicate check on name + username
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, username, platformType, password, refreshCycle, notes, collectionId, totpQrBase64 } = req.body;
    if (!name || !username || !platformType || !password) {
      res.status(400).json({
        error: "Name, username, platform type, and password are required.",
      });
      return;
    }

    // BUG 4: Check for duplicate
    const existing = await prisma.account.findFirst({
      where: { name, username },
    });
    if (existing) {
      res
        .status(409)
        .json({ error: "This account already exists in the vault." });
      return;
    }

    try {
      const { score, label } = scorePassword(password);
      const secretRef = await storeSecret(password);
      const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

      // Password Reuse Detection (#14)
      const reusedAccount = await prisma.account.findFirst({
        where: { passwordHash }
      });
      if (reusedAccount) {
        notifyAdmins(
          "Password Reuse Detected",
          `The password for "${name}" is identical to an existing account ("${reusedAccount.name}").`,
          "PASSWORD_WEAK"
        );
      }

      // ADMIN entries are auto-approved; MANAGER entries go through QA
      const isAdmin = req.user!.role === "ADMIN";
      const qaStatus = isAdmin ? "APPROVED" : "PENDING";
      const cycle = refreshCycle || "SIX_MONTHS";

      const account = await prisma.account.create({
        data: {
          name,
          username,
          platformType,
          secretRef,
          ownerId: req.user!.id,
          healthScore: score,
          healthLabel: label,
          refreshCycle: cycle,
          notes,
          passwordHash,
          totpQrBase64,
          collectionId: collectionId === "" ? null : collectionId,
          qaStatus,
          createdBy: req.user!.id,
        },
      });

      // If admin, also auto-create rotation schedule
      if (isAdmin) {
        const cycleDurations: Record<string, number> = {
          MONTHLY: 30,
          SIX_MONTHS: 180,
          ANNUALLY: 365,
          MANUAL: 365 * 10,
        };
        const daysUntilDue = cycleDurations[cycle] || 180;
        const nextDue = new Date(
          Date.now() + daysUntilDue * 24 * 60 * 60 * 1000,
        );
        await prisma.rotationSchedule.create({
          data: { accountId: account.id, cycle, nextDue },
        });
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: account.id,
          action: isAdmin ? "ACCOUNT_CREATED" : "ACCOUNT_SUBMITTED",
          ipAddress: req.ip,
        },
      });

      // Only notify admins for QA if not self-approved
      if (!isAdmin) {
        notifyAdmins(
          "New Entry for QA Review",
          `${req.user!.name} submitted "${name}" for QA approval.`,
          "NEW_ENTRY_QA",
        );
      }

      // If weak password, alert admins + owner
      if (score < 40) {
        notifyUser(
          req.user!.id,
          "Weak Password Alert",
          `The password for "${name}" scored ${score}/100. Consider using a stronger password.`,
          "PASSWORD_WEAK",
        );
        notifyAdmins(
          "Weak Password Submitted",
          `"${name}" has a health score of ${score}/100.`,
          "PASSWORD_WEAK",
        );
      }

      res.status(201).json({
        id: account.id,
        name: account.name,
        healthScore: score,
        healthLabel: label,
        qaStatus,
      });
    } catch (error) {
      console.error("[Account Create]", error);
      res.status(500).json({ error: "Failed to create account." });
    }
  },
);

// PATCH /api/accounts/:id/qa — approve/reject QA [ADMIN]
// BUG 10 DEFENSE: auto-create RotationSchedule on approval
router.patch(
  "/:id/qa",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { qaStatus } = req.body;
    if (!["APPROVED", "REJECTED"].includes(qaStatus)) {
      res.status(400).json({ error: "qaStatus must be APPROVED or REJECTED." });
      return;
    }
    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
      });
      if (!account || account.qaStatus !== "PENDING") {
        res.status(400).json({ error: "Account is not in PENDING QA status." });
        return;
      }

      if (qaStatus === "APPROVED") {
        // BUG 10: Auto-create rotation schedule
        const cycleDurations: Record<string, number> = {
          MONTHLY: 30,
          SIX_MONTHS: 180,
          ANNUALLY: 365,
          MANUAL: 365 * 10,
        };
        const daysUntilDue = cycleDurations[account.refreshCycle] || 180;
        const nextDue = new Date(
          Date.now() + daysUntilDue * 24 * 60 * 60 * 1000,
        );

        await prisma.$transaction([
          prisma.account.update({
            where: { id: req.params.id },
            data: { qaStatus: "APPROVED" },
          }),
          prisma.rotationSchedule.create({
            data: {
              accountId: req.params.id,
              cycle: account.refreshCycle,
              nextDue,
            },
          }),
        ]);
      } else {
        await prisma.account.update({
          where: { id: req.params.id },
          data: { qaStatus: "REJECTED" },
        });
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: req.params.id,
          action: `QA_${qaStatus}`,
          ipAddress: req.ip,
        },
      });
      res.json({ message: `Account ${qaStatus.toLowerCase()}.` });
    } catch (error) {
      console.error("[QA]", error);
      res.status(500).json({ error: "QA action failed." });
    }
  },
);

// POST /api/accounts/:id/reveal — fetch password from Secret Manager [HOLDER with grant]
router.post(
  "/:id/reveal",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accountId = req.params.id;
    const userId = req.user!.id;

    let validatedGrant: any = null;

    try {
      // Admins and Managers can reveal any approved account
      if (req.user!.role === "HOLDER") {
        // Check grant exists, is active, and not expired
        validatedGrant = await prisma.accessGrant.findFirst({
          where: {
            accountId,
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (!validatedGrant) {
          // Clean up any expired grants for this user+account so UI shows correctly
          await prisma.accessGrant.updateMany({
            where: { accountId, userId, active: true, expiresAt: { lte: new Date() } },
            data: { active: false },
          });
          res.status(403).json({
            error: "Your access has expired. Please request access again.",
          });
          return;
        }
      }


      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      // Write audit BEFORE returning secret
      await prisma.auditLog.create({
        data: {
          userId,
          accountId,
          action: "PASSWORD_REVEALED",
          ipAddress: req.ip,
        },
      });

      const password = await fetchSecret(account.secretRef);

      let expiresIn: number | null = null;
      let grantExpiresAt: Date | null = null;

      // If HOLDER, check for VIEW_90S or TEMP_24H grant to shrink
      if (req.user!.role === "HOLDER" && validatedGrant) {
        let grant = validatedGrant;

        if (grant) {
          // First view shrink logic
          if (grant.expiresAt === null) {
            const accessType = (grant as any).accessType || "ONGOING";
            if (accessType === "VIEW_90S") {
              const newExpires = new Date(Date.now() + 90 * 1000);
              grant = await prisma.accessGrant.update({
                where: { id: grant.id },
                data: { expiresAt: newExpires },
              });
            } else if (accessType === "TEMP_24H") {
              const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
              grant = await prisma.accessGrant.update({
                where: { id: grant.id },
                data: { expiresAt: newExpires },
              });
            }
          }

          // Calculate remaining seconds
          if (grant.expiresAt) {
            const remaining = Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000));
            expiresIn = Math.min(90, remaining);
            grantExpiresAt = grant.expiresAt;
          }
        }
      }

      res.json({ password, expiresIn, grantExpiresAt });
    } catch (error) {
      console.error("[Reveal]", error);
      res.status(500).json({ error: "Failed to reveal password." });
    }
  },
);

// POST /api/accounts/:id/reveal-qr — fetch TOTP QR code from Secret Manager [HOLDER with grant]
router.post(
  "/:id/reveal-qr",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accountId = req.params.id;
    const userId = req.user!.id;

    let validatedGrant: any = null;

    try {
      if (req.user!.role === "HOLDER") {
        validatedGrant = await prisma.accessGrant.findFirst({
          where: {
            accountId,
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (!validatedGrant) {
          // Clean up any expired grants for this user+account so UI shows correctly
          await prisma.accessGrant.updateMany({
            where: { accountId, userId, active: true, expiresAt: { lte: new Date() } },
            data: { active: false },
          });
          res.status(403).json({
            error: "Your access has expired. Please request access again.",
          });
          return;
        }
      }

      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      
      if (!account.totpQrBase64) {
        res.status(404).json({ error: "No QR Code found for this account." });
        return;
      }

      // Write audit BEFORE returning secret
      await prisma.auditLog.create({
        data: {
          userId,
          accountId,
          action: "QR_CODE_REVEALED",
          ipAddress: req.ip,
        },
      });

      let expiresIn: number | null = null;
      let grantExpiresAt: Date | null = null;

      // If HOLDER, check for VIEW_90S or TEMP_24H grant to shrink
      if (req.user!.role === "HOLDER" && validatedGrant) {
        let grant = validatedGrant;

        if (grant) {
          // First view shrink logic
          if (grant.expiresAt === null) {
            const accessType = (grant as any).accessType || "ONGOING";
            if (accessType === "VIEW_90S") {
              const newExpires = new Date(Date.now() + 90 * 1000);
              grant = await prisma.accessGrant.update({
                where: { id: grant.id },
                data: { expiresAt: newExpires },
              });
            } else if (accessType === "TEMP_24H") {
              const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
              grant = await prisma.accessGrant.update({
                where: { id: grant.id },
                data: { expiresAt: newExpires },
              });
            }
          }

          // Calculate remaining seconds
          if (grant.expiresAt) {
            const remaining = Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000));
            expiresIn = Math.min(90, remaining);
            grantExpiresAt = grant.expiresAt;
          }
        }
      }

      res.json({ qrCodeBase64: account.totpQrBase64, expiresIn, grantExpiresAt });
    } catch (error) {
      console.error("[Reveal QR]", error);
      res.status(500).json({ error: "Failed to reveal QR Code." });
    }
  },
);

// POST /api/accounts/:id/force-rotate — force password rotation [ADMIN]
router.post(
  "/:id/force-rotate",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      const now = new Date();

      await prisma.rotationSchedule.upsert({
        where: { accountId: account.id },
        update: { nextDue: now },
        create: {
          accountId: account.id,
          cycle: account.refreshCycle,
          nextDue: now,
        },
      });

      notifyUser(
        account.ownerId,
        "Mandatory Password Rotation",
        `An admin has requested a mandatory password rotation for "${account.name}". Please update it immediately.`,
        "ROTATION_DUE"
      );

      res.json({ message: "Force rotation triggered successfully." });
    } catch (error) {
      console.error("[Force Rotate]", error);
      res.status(500).json({ error: "Failed to force rotation." });
    }
  }
);

// PATCH /api/accounts/:id — update account details [ADMIN]
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, username, platformType, refreshCycle, password, notes, collectionId, totpQrBase64 } = req.body;

    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (username) updateData.username = username;
      if (platformType) updateData.platformType = platformType;
      if (refreshCycle) updateData.refreshCycle = refreshCycle;
      if (notes !== undefined) updateData.notes = notes;
      if (totpQrBase64 !== undefined) updateData.totpQrBase64 = totpQrBase64;
      if (collectionId !== undefined) updateData.collectionId = collectionId === "" ? null : collectionId;

      if (password) {
        const { score, label } = scorePassword(password);
        const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

        const reusedAccount = await prisma.account.findFirst({
          where: { passwordHash, id: { not: account.id } }
        });
        if (reusedAccount) {
          notifyAdmins(
            "Password Reuse Detected",
            `The updated password for "${account.name}" is identical to an existing account ("${reusedAccount.name}").`,
            "PASSWORD_WEAK"
          );
        }

        const newSecretRef = await updateSecret(account.secretRef, password);
        updateData.secretRef = newSecretRef;
        updateData.passwordHash = passwordHash;
        updateData.healthScore = score;
        updateData.healthLabel = label;
      }

      const updated = await prisma.account.update({
        where: { id: req.params.id },
        data: updateData,
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: updated.id,
          action: "ACCOUNT_UPDATED",
          ipAddress: req.ip,
        },
      });

      res.json({ ...updated, secretRef: undefined });
    } catch (error) {
      console.error("[Update Account]", error);
      res.status(500).json({ error: "Failed to update account." });
    }
  }
);

// DELETE /api/accounts/:id — delete an account [ADMIN]
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      await deleteSecret(account.secretRef);

      await prisma.account.delete({
        where: { id: req.params.id },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "ACCOUNT_DELETED",
          metadata: { deletedAccount: account.name },
          ipAddress: req.ip,
        },
      });

      res.json({ message: "Account deleted." });
    } catch (error) {
      console.error("[Delete Account]", error);
      res.status(500).json({ error: "Failed to delete account." });
    }
  }
);

export default router;
