/**
 * Department Routes — configurable list of department names used by
 * Settings (CRUD), and as the dropdown source for Register/Profile/Users.
 * `User.department` is a free-text field, not a relation to this table —
 * see the comment on the Department model in schema.prisma.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prismaClient";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { asString } from "../utils/reqValue";

const router = Router();

// GET /api/departments - list all departments [PUBLIC — Register.jsx needs
// the list before the user is authenticated, same reasoning as
// /api/auth/setup-status]
router.get("/", async (_req: Request, res: Response) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
    });
    const deptsWithCounts = await Promise.all(
      departments.map(async (d) => {
        const userCount = await prisma.user.count({
          where: { department: d.name },
        });
        return {
          ...d,
          userCount,
        };
      })
    );
    res.json(deptsWithCounts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch departments." });
  }
});

// POST /api/departments - create a new department [ADMIN]
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    try {
      const existing = await prisma.department.findUnique({ where: { name: name.trim() } });
      if (existing) {
        res.status(409).json({ error: "Department with this name already exists." });
        return;
      }
      const department = await prisma.department.create({ data: { name: name.trim() } });
      res.status(201).json(department);
    } catch (error) {
      res.status(500).json({ error: "Failed to create department." });
    }
  },
);

// PATCH /api/departments/:id - rename a department [ADMIN]
// Renaming does not touch existing User.department values on already-
// assigned users (it's free text) — admins should re-assign affected
// users afterward if they want the rename to propagate.
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    try {
      const department = await prisma.department.update({
        where: { id: asString(req.params.id) },
        data: { name: name.trim() },
      });
      res.json(department);
    } catch (error) {
      res.status(404).json({ error: "Department not found." });
    }
  },
);

// DELETE /api/departments/:id - delete a department [ADMIN]
// Deleting a department reassigns any users assigned to it to the "Unspecified Department".
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const department = await prisma.department.findUnique({ where: { id: asString(req.params.id) } });
      if (!department) {
        res.status(404).json({ error: "Department not found." });
        return;
      }
      const inUse = await prisma.user.count({ where: { department: department.name } });
      const unspecifiedDeptName = "Unspecified";

      if (department.name === unspecifiedDeptName) {
        if (inUse > 0) {
          res.status(400).json({
            error: `Cannot delete "${unspecifiedDeptName}" while ${inUse} user(s) are still assigned to it.`,
          });
          return;
        }
      } else if (inUse > 0) {
        // Ensure "Unspecified Department" exists in the Department table
        await prisma.department.upsert({
          where: { name: unspecifiedDeptName },
          update: {},
          create: { name: unspecifiedDeptName },
        });

        // Reassign affected users
        await prisma.user.updateMany({
          where: { department: department.name },
          data: { department: unspecifiedDeptName },
        });
      }

      await prisma.department.delete({ where: { id: asString(req.params.id) } });
      res.json({ message: "Department deleted successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete department." });
    }
  },
);

// Legacy hardcoded list this repo used before the Department table existed
// (Register.jsx, Profile.jsx, Users.jsx all had this baked in). Seeded once
// on first startup so existing users' `department` values still resolve to
// something in the dropdown instead of the list appearing empty.
const LEGACY_DEFAULT_DEPARTMENTS = [
  "IT",
  "HR",
  "Marketing",
  "Business",
  "GAP",
  "Operation",
  "Staff",
  "Executive",
];

// Run once on server startup (see index.ts). No-ops on every run after the
// first — only fires when the Department table is empty, so an admin who's
// since deleted departments down to zero on purpose won't have them
// resurrected on the next restart.
export async function seedDefaultDepartments() {
  const count = await prisma.department.count();
  if (count > 0) return;

  const existingUserDepartments = await prisma.user.findMany({
    where: { department: { not: null } },
    select: { department: true },
    distinct: ["department"],
  });

  const names = new Set(LEGACY_DEFAULT_DEPARTMENTS);
  for (const { department } of existingUserDepartments) {
    if (department) names.add(department);
  }

  await prisma.department.createMany({
    data: Array.from(names).map((name) => ({ name })),
    skipDuplicates: true,
  });
  console.log(`[Startup] Seeded ${names.size} default department(s).`);
}

export default router;
