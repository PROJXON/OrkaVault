import { Router, Response } from "express";
import { prisma } from "../lib/prismaClient";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { asString } from "../utils/reqValue";
import { writeAuditSafe } from "../services/audit";

const router = Router();

// Every change writes ORG_POLICY_CHANGED (Phase 4c §3), the
// AUDIT_LOG_RETENTION_DAYS change in particular: shortening retention is a
// way to purge history, so it must leave a row. `from` comes from the row
// being replaced, never from the request body.
type PolicySnapshot = { name: string; value: string | null; enabled: boolean } | null;
const snap = (p: { name: string; value: string | null; enabled: boolean } | null): PolicySnapshot =>
  p ? { name: p.name, value: p.value, enabled: p.enabled } : null;

function auditPolicyChange(req: AuthenticatedRequest, key: string, from: PolicySnapshot, to: PolicySnapshot) {
  return writeAuditSafe({
    action: "ORG_POLICY_CHANGED",
    userId: req.user!.id,
    actorEmail: req.user!.email,
    metadata: { key, from, to },
    req,
  });
}

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
      await auditPolicyChange(req, policy.name, null, snap(policy));
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
          const updated = await prisma.organizationPolicy.update({
            where: { id: existing.id },
            data: { value: p.value !== undefined ? String(p.value) : existing.value },
          });
          // The Settings page saves every field at once; only log real changes.
          if (updated.value !== existing.value) {
            await auditPolicyChange(req, existing.name, snap(existing), snap(updated));
          }
        } else {
          const created = await prisma.organizationPolicy.create({
            data: {
              name: p.name,
              type: p.type || "SETTING",
              value: String(p.value),
              enabled: true,
            },
          });
          await auditPolicyChange(req, created.name, null, snap(created));
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
      const before = await prisma.organizationPolicy.findUnique({ where: { id: asString(req.params.id) } });
      if (!before) {
        res.status(404).json({ error: "Policy not found." });
        return;
      }
      const policy = await prisma.organizationPolicy.update({
        where: { id: asString(req.params.id) },
        data: {
          ...(enabled !== undefined && { enabled }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(type && { type }),
          ...(req.body.value !== undefined && { value: req.body.value }),
        },
      });
      await auditPolicyChange(req, before.name, snap(before), snap(policy));
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
      const deleted = await prisma.organizationPolicy.delete({
        where: { id: asString(req.params.id) },
      });
      await auditPolicyChange(req, deleted.name, snap(deleted), null);
      res.json({ message: "Policy deleted successfully." });
    } catch (error) {
      res.status(404).json({ error: "Policy not found." });
    }
  }
);

export default router;
