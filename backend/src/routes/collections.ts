import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/collections - list all collections
router.get("/", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { accounts: true } } }
    });
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch collections." });
  }
});

// POST /api/collections - create a new collection [ADMIN]
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "Name is required." });
      return;
    }

    try {
      const existing = await prisma.collection.findUnique({ where: { name } });
      if (existing) {
        res.status(409).json({ error: "Collection with this name already exists." });
        return;
      }

      const collection = await prisma.collection.create({
        data: { name, description },
        include: { _count: { select: { accounts: true } } }
      });
      res.status(201).json(collection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create collection." });
    }
  }
);

// PATCH /api/collections/:id - update a collection [ADMIN]
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, description } = req.body;
    try {
      const collection = await prisma.collection.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
        },
        include: { _count: { select: { accounts: true } } }
      });
      res.json(collection);
    } catch (error) {
      res.status(404).json({ error: "Collection not found." });
    }
  }
);

// DELETE /api/collections/:id - delete a collection [ADMIN]
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Unlink accounts first
      await prisma.account.updateMany({
        where: { collectionId: req.params.id },
        data: { collectionId: null }
      });
      await prisma.collection.delete({
        where: { id: req.params.id },
      });
      res.json({ message: "Collection deleted successfully." });
    } catch (error) {
      res.status(404).json({ error: "Collection not found." });
    }
  }
);

export default router;
