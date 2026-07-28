/**
 * OrkaVault Backend — Main Entry Point
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { PrismaClient } from "@prisma/client";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import accountRoutes from "./routes/accounts";
import requestRoutes from "./routes/requests";
import miscRoutes from "./routes/misc";
import directoryRoutes from "./routes/directory";
import profileRoutes from "./routes/profile";
import policiesRoutes from "./routes/policies";
import collectionsRoutes from "./routes/collections";
import departmentsRoutes, { seedDefaultDepartments } from "./routes/departments";
import workspaceActivityRoutes from "./routes/workspaceActivity";
import backupsRoutes from "./routes/backups";
import integrationsRoutes from "./routes/integrations";
import { notifyAdmins } from "./services/notifications";
import { ingestWorkspaceActivity, syncConnectedApps, syncWorkspaceDevices } from "./services/googleWorkspace";
import { runAuditRetentionSweep } from "./services/auditBackup";
import { errorHandler } from "./middleware/errorHandler";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;
// Log Events
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
// Accounts routes carry base64 QR images in JSON bodies (single edits and
// PATCH /api/accounts/bulk-qr, which batches several at once) — the
// default 100kb express.json() limit is too small for that and would
// reject legitimate saves before they reach the route. Scoped to this
// path only; every other route keeps the default limit.
app.use("/api/accounts", express.json({ limit: "10mb" }));
// Discord interaction signature verification (verifyDiscordSignature) needs
// the exact raw bytes Discord signed — must be scoped ahead of the global
// express.json() below, same pattern as the /api/accounts override above.
app.use("/api/integrations/discord/interactions", express.raw({ type: "application/json" }));
app.use(express.json());

// ─── Serve uploaded avatars as static files ────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ─── Mount Routes ──────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/directory", directoryRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/policies", policiesRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/workspace-activity", workspaceActivityRoutes);
app.use("/api/backups", backupsRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api", miscRoutes);

// Error Handler must be the last middleware
app.use(errorHandler);

// ─── Cron Jobs (run on startup, then on interval) ──────────────────────

/** Offboarding alert: flag users with endDate within 30 days */
async function checkOffboarding() {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: {
        active: true,
        endDate: { not: null, lte: thirtyDaysFromNow },
      },
    });
    for (const user of users) {
      if ((user.endDate as Date) <= now) {
        // Auto-revoke
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { active: false, revoked: true },
          }),
          prisma.accessGrant.updateMany({
            where: { userId: user.id, active: true },
            data: { active: false },
          }),
        ]);
        notifyAdmins(
          "Offboarding Executed",
          `${user.name} (${user.email}) has reached their end date and was automatically deactivated.`,
          "OFFBOARDING_ALERT",
        );
      } else {
        const daysLeft = Math.ceil(
          ((user.endDate as Date).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        );
        notifyAdmins(
          "Offboarding Alert",
          `${user.name} (${user.email}) has an end date in ${daysLeft} days.`,
          "OFFBOARDING_ALERT",
        );
      }
    }
    if (users.length > 0)
      console.log(`[Cron] Offboarding alerts sent for ${users.length} users.`);
  } catch (error) {
    console.error("[Cron] Offboarding check failed:", error);
  }
}

/** Rotation due checker */
async function checkRotationDue() {
  try {
    const now = new Date();
    const schedules = await prisma.rotationSchedule.findMany({
      where: {
        nextDue: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      include: { account: true },
    });
    for (const schedule of schedules) {
      if (schedule.nextDue <= now) {
        notifyAdmins(
          "Password Rotation Overdue",
          `"${schedule.account.name}" is overdue for password rotation.`,
          "ROTATION_DUE",
        );
      } else {
        notifyAdmins(
          "Password Rotation Due Soon",
          `"${schedule.account.name}" rotation is due within ${schedule.alertDaysBefore} days.`,
          "ROTATION_DUE",
        );
      }
    }
  } catch (error) {
    console.error("[Cron] Rotation check failed:", error);
  }
}

/** Audit log retention: backs old rows up to CSV and purges them from Postgres. No-op until configured. */
async function checkAuditRetention() {
  try {
    const result = await runAuditRetentionSweep();
    if (!result.skipped && result.backedUp > 0) {
      console.log(`[Cron] Audit retention: backed up ${result.backedUp} row(s) to ${result.file}.`);
    }
  } catch (error) {
    console.error("[Cron] Audit retention sweep failed:", error);
  }
}

// ─── Start Server ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 OrkaVault API running on http://localhost:${PORT}`);

  // One-time (no-op after the first successful run) — see seedDefaultDepartments jsdoc
  await seedDefaultDepartments().catch((error) =>
    console.error("[Startup] Department seeding failed:", error),
  );

  // Run cron checks on startup
  await checkOffboarding();
  await checkRotationDue();
  await checkAuditRetention();
  await ingestWorkspaceActivity();
  await syncConnectedApps();
  await syncWorkspaceDevices();

  // Run daily (every 24 hours)
  setInterval(checkOffboarding, 24 * 60 * 60 * 1000);
  setInterval(checkRotationDue, 24 * 60 * 60 * 1000);
  setInterval(checkAuditRetention, 24 * 60 * 60 * 1000);
  // Workspace activity: 30 min, not 24h — see docs/google-workspace-admin-sdk-monitoring.md §1
  // on Google's own multi-hour ingestion lag (polling faster doesn't help, slower loses freshness).
  setInterval(ingestWorkspaceActivity, 30 * 60 * 1000);
  // Connected apps and devices are current-state snapshots, not security
  // event feeds — both change far less often, so a longer interval is enough.
  setInterval(syncConnectedApps, 6 * 60 * 60 * 1000);
  setInterval(syncWorkspaceDevices, 6 * 60 * 60 * 1000);
});
