/**
 * Profile Routes — Self-service profile management for all authenticated users
 */
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// ── Avatar Upload Config ──────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// GET /api/profile/me
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        startDate: true,
        clearanceLevel: true,
        internationalAccess: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// PATCH /api/profile/me — self-update: name, department, startDate
router.patch("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { name, department, startDate } = req.body;
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(department && { department }),
        ...(startDate && { startDate: new Date(startDate) }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        startDate: true,
        avatarUrl: true,
      },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile." });
  }
});

// POST /api/profile/me/avatar — upload profile picture
router.post(
  "/me/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }
    try {
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatarUrl },
      });
      res.json({ avatarUrl });
    } catch (error) {
      res.status(500).json({ error: "Failed to save avatar." });
    }
  }
);

// PATCH /api/profile/password — change password
router.patch("/password", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.passwordHash) {
      res.status(400).json({ error: "User has no password set (OAuth only?)." });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect current password." });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update password." });
  }
});

export default router;
