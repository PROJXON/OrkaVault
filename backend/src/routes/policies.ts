import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/policies - list all policies
router.get("/", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const policies = await prisma.organizationPolicy.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch policies." });
  }
});

// POST /api/policies - create a new policy [ADMIN ONLY]
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, type, enabled, value } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: "Name and Type are required." });
      return;
    }

    try {
      const policy = await prisma.organizationPolicy.create({
        data: {
          name,
          description,
          type,
          value,
          enabled: enabled ?? true,
        },
      });
      res.status(201).json(policy);
    } catch (error) {
      res.status(500).json({ error: "Failed to create policy." });
    }
  }
);

// POST /api/policies/bulk - upsert multiple policies [ADMIN ONLY]
router.post(
  "/bulk",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const policies = req.body.policies; // Array of { name, value, type }
    if (!Array.isArray(policies)) {
      res.status(400).json({ error: "policies array is required." });
      return;
    }
    try {
      for (const p of policies) {
        const existing = await prisma.organizationPolicy.findFirst({ where: { name: p.name } });
        if (existing) {
          await prisma.organizationPolicy.update({
            where: { id: existing.id },
            data: { value: p.value !== undefined ? String(p.value) : existing.value },
          });
        } else {
          await prisma.organizationPolicy.create({
            data: {
              name: p.name,
              type: p.type || "SETTING",
              value: String(p.value),
              enabled: true,
            },
          });
        }
      }
      res.json({ message: "Policies updated." });
    } catch (error) {
      console.error("[Policies Bulk]", error);
      res.status(500).json({ error: "Failed to update policies." });
    }
  }
);

// PATCH /api/policies/:id - toggle or update a policy [ADMIN ONLY]
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { enabled, name, description, type } = req.body;
    try {
      const policy = await prisma.organizationPolicy.update({
        where: { id: req.params.id },
        data: {
          ...(enabled !== undefined && { enabled }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(type && { type }),
          ...(req.body.value !== undefined && { value: req.body.value }),
        },
      });
      res.json(policy);
    } catch (error) {
      res.status(404).json({ error: "Policy not found." });
    }
  }
);

// DELETE /api/policies/:id - delete a policy [ADMIN ONLY]
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await prisma.organizationPolicy.delete({
        where: { id: req.params.id },
      });
      res.json({ message: "Policy deleted successfully." });
    } catch (error) {
      res.status(404).json({ error: "Policy not found." });
    }
  }
);

export default router;
