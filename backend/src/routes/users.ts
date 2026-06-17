/**
 * User Routes — List, Approve, Role Change, End Date, Deactivate, Notification Toggle
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from "../middleware/auth";
import { notifyUser } from "../services/notifications";

const prisma = new PrismaClient();
const router = Router();

// GET /api/users — list all users [ADMIN]
router.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: AuthenticatedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { managedCollections: true },
    });
    res.json(users.map((u) => ({ ...u, passwordHash: undefined })));
  },
);

// PATCH /api/users/:id/approve — set active=true [ADMIN]
router.patch(
  "/:id/approve",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { active: true, revoked: false },
      });
      // Notify the approved user
      notifyUser(
        user.id,
        "Welcome to OrkaVault!",
        "Your account has been activated. Welcome aboard — you now have access to the organization vault.",
        "REGISTRATION_APPROVED",
      );
      res.json({
        message: "User approved.",
        user: { ...user, passwordHash: undefined },
      });
    } catch {
      res.status(404).json({ error: "User not found." });
    }
  },
);

// PATCH /api/users/:id/decline — decline a user registration [ADMIN]
router.patch(
  "/:id/decline",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { active: false, revoked: true },
      });
      res.json({
        message: "User registration declined.",
        user: { ...user, passwordHash: undefined },
      });
    } catch {
      res.status(404).json({ error: "User not found." });
    }
  },
);

// PATCH /api/users/:id/role — change role [ADMIN]
// BUG 9 DEFENSE: user cannot change their own role
router.patch(
  "/:id/role",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.id === req.params.id) {
      res.status(403).json({ error: "You cannot change your own role." });
      return;
    }
    const { role } = req.body;
    if (role === "ADMIN") {
      res.status(403).json({ error: "Cannot assign ADMIN role. Only one admin is allowed." });
      return;
    }
    if (!["HOLDER", "MANAGER"].includes(role)) {
      res.status(400).json({ error: "Invalid role." });
      return;
    }
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { role },
      });
      res.json({
        message: "Role updated.",
        user: { ...user, passwordHash: undefined },
      });
    } catch {
      res.status(404).json({ error: "User not found." });
    }
  },
);

// PATCH /api/users/:id/enddate — set end date [ADMIN]
router.patch(
  "/:id/enddate",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { endDate } = req.body;
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { endDate: endDate ? new Date(endDate) : null },
      });
      res.json({
        message: "End date updated.",
        user: { ...user, passwordHash: undefined },
      });
    } catch {
      res.status(404).json({ error: "User not found." });
    }
  },
);

// DELETE /api/users/:id — deactivate user [ADMIN]
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user!.id === req.params.id) {
      res.status(403).json({ error: "You cannot deactivate yourself." });
      return;
    }
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: req.params.id },
          data: { active: false, revoked: true },
        }),
        prisma.accessGrant.updateMany({
          where: { userId: req.params.id, active: true },
          data: { active: false },
        }),
      ]);
      res.json({ message: "User deactivated and all grants revoked." });
    } catch {
      res.status(404).json({ error: "User not found." });
    }
  },
);

// PATCH /api/users/me/notifications — toggle notificationsOn [ALL]
router.patch(
  "/me/notifications",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { notificationsOn } = req.body;
    if (typeof notificationsOn !== "boolean") {
      res.status(400).json({ error: "notificationsOn must be a boolean." });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { notificationsOn },
    });
    res.json({ notificationsOn: user.notificationsOn });
  },
);

// PATCH /api/users/:id/profile — update department, startDate, clearanceLevel [ADMIN]
router.patch(
  "/:id/profile",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { department, startDate, clearanceLevel, managedCollectionIds } = req.body;
    console.log("PROFILE UPDATE BODY:", req.body);
    try {
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(department !== undefined && { department }),
          ...(startDate !== undefined && {
            startDate: startDate ? new Date(startDate) : undefined,
          }),
          ...(clearanceLevel !== undefined && { clearanceLevel: clearanceLevel ?? null }),
          ...(managedCollectionIds !== undefined && {
            managedCollections: {
              set: managedCollectionIds.map((id: string) => ({ id }))
            }
          }),
        },
        include: { managedCollections: true },
      });
      res.json({ ...updated, passwordHash: undefined });
    } catch (e) {
      console.error("[Profile Update Error]", e);
      res.status(400).json({ error: "Failed to update profile. Please check the provided data." });
    }
  },
);

// POST /api/users/me/favorites/:accountId — add to favorites [ALL]
router.post(
  "/me/favorites/:accountId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          favorites: { push: req.params.accountId },
        },
      });
      // Deduplicate in memory in case of concurrent pushes
      const uniqueFavorites = Array.from(new Set(user.favorites));
      if (uniqueFavorites.length !== user.favorites.length) {
        await prisma.user.update({
          where: { id: req.user!.id },
          data: { favorites: uniqueFavorites },
        });
      }
      res.json({ message: "Added to favorites", favorites: uniqueFavorites });
    } catch {
      res.status(500).json({ error: "Failed to add favorite." });
    }
  },
);

// DELETE /api/users/me/favorites/:accountId — remove from favorites [ALL]
router.delete(
  "/me/favorites/:accountId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const newFavorites = user.favorites.filter((id) => id !== req.params.accountId);
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { favorites: newFavorites },
      });
      res.json({ message: "Removed from favorites", favorites: newFavorites });
    } catch {
      res.status(500).json({ error: "Failed to remove favorite." });
    }
  },
);

// PATCH /api/users/:id/gap-extend — Extend user access by 6 months (GAP transition)
router.patch(
  "/:id/gap-extend",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      // Reset the start date to today, so offboarding is pushed 6 months out
      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: { startDate: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "USER_GAP_EXTENDED",
          metadata: { extendedUserId: updated.id, name: updated.name },
          ipAddress: req.ip,
        },
      });

      res.json({ message: "User access extended by 6 months." });
    } catch (error) {
      console.error("[GAP Extend Error]", error);
      res.status(500).json({ error: "Failed to extend user access." });
    }
  }
);

export default router;
