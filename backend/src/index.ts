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
import { notifyAdmins } from "./services/notifications";
import { errorHandler } from "./middleware/errorHandler";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
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

// ─── Start Server ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 OrkaVault API running on http://localhost:${PORT}`);

  // Run cron checks on startup
  await checkOffboarding();
  await checkRotationDue();

  // Run daily (every 24 hours)
  setInterval(checkOffboarding, 24 * 60 * 60 * 1000);
  setInterval(checkRotationDue, 24 * 60 * 60 * 1000);
});
