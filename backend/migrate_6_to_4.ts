import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database migration: SIX_MONTHS to FOUR_MONTHS");

  // 1. Update all Accounts
  const accountResult = await prisma.account.updateMany({
    where: {
      refreshCycle: "SIX_MONTHS",
    },
    data: {
      refreshCycle: "FOUR_MONTHS",
    },
  });
  console.log(`Updated ${accountResult.count} accounts.`);

  // 2. Update all RotationSchedules
  const scheduleResult = await prisma.rotationSchedule.updateMany({
    where: {
      cycle: "SIX_MONTHS",
    },
    data: {
      cycle: "FOUR_MONTHS",
    },
  });
  console.log(`Updated ${scheduleResult.count} rotation schedules.`);

  console.log("Migration complete!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
