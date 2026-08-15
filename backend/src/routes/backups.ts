/**
 * Audit Log Backup Routes — list/download CSV backups, trigger a sweep on demand
 */
import { Router, Response } from "express";
import path from "path";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { listBackups, isValidBackupFilename, runAuditRetentionSweep, BACKUPS_DIR } from "../services/auditBackup";
import { asString } from "../utils/reqValue";

const router = Router();

// GET /api/backups — list audit-log CSV backups on disk [ADMIN]
router.get("/", requireAuth, requireRole("ADMIN"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(listBackups());
});

// GET /api/backups/:filename — download a backup CSV [ADMIN]
router.get(
  "/:filename",
  requireAuth,
  requireRole("ADMIN"),
  (req: AuthenticatedRequest, res: Response) => {
    const filename = asString(req.params.filename);
    if (!filename || !isValidBackupFilename(filename)) {
      res.status(400).json({ error: "Invalid backup filename." });
      return;
    }
    res.download(path.join(BACKUPS_DIR, filename), (err) => {
      if (err) res.status(404).json({ error: "Backup not found." });
    });
  },
);

// POST /api/backups/run — trigger the retention sweep immediately [ADMIN]
router.post("/run", requireAuth, requireRole("ADMIN"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runAuditRetentionSweep();
    if (result.skipped) {
      res.json({ message: "Retention is not configured (set a retention window in Settings > Backups first)." });
      return;
    }
    res.json({
      message: `Backed up and purged ${result.backedUp} log row(s).`,
      ...result,
    });
  } catch (error) {
    console.error("[Audit Backup] Manual run failed:", error);
    res.status(500).json({ error: "Failed to run the backup sweep." });
  }
});

export default router;
