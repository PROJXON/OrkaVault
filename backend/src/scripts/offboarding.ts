import { PrismaClient } from "@prisma/client";
import { notifyAdmins } from "../services/notifications";

const prisma = new PrismaClient();

async function runOffboardingCheck() {
  console.log("Starting offboarding check...");
  
  const users = await prisma.user.findMany({
    where: {
      active: true,
      department: {
        notIn: ["STAFF", "EXECUTIVE", "Staff", "Executive", "staff", "executive"]
      }
    }
  });

  const now = new Date();
  let notifiedCount = 0;

  for (const user of users) {
    // Determine offboard date: 6 months from startDate
    const startDate = user.startDate || user.createdAt; // fallback to createdAt
    const offboardDate = new Date(startDate.getTime());
    offboardDate.setMonth(offboardDate.getMonth() + 6);
    
    // Calculate difference in days
    const diffTime = offboardDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Notification for 7 days before
    if (diffDays === 7) {
      await notifyAdmins(
        "Upcoming Offboarding (7 Days)",
        `${user.name} is offboarding in 7 days. Please review and revoke access.`,
        "WARNING",
        `/directory?user=${user.id}`
      );
      notifiedCount++;
      console.log(`Notified 7-day warning for user ${user.email}`);
    }
    
    // Notification for today (0 days)
    if (diffDays === 0) {
      await notifyAdmins(
        "Offboarding Today",
        `${user.name} is offboarding today! Revoke access immediately.`,
        "URGENT",
        `/directory?user=${user.id}`
      );
      notifiedCount++;
      console.log(`Notified day-of warning for user ${user.email}`);
    }
  }

  console.log(`Offboarding check complete. Sent ${notifiedCount} notifications.`);
  await prisma.$disconnect();
}

runOffboardingCheck().catch((error) => {
  console.error("Failed to run offboarding check:", error);
  process.exit(1);
});
