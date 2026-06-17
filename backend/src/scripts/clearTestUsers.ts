import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find all non-admin users first
  const testUsers = await prisma.user.findMany({
    where: { email: { not: "admin@projxon.com" } },
    select: { id: true },
  });
  const ids = testUsers.map((u) => u.id);

  if (ids.length === 0) {
    console.log("No test users found. Nothing to delete.");
    return;
  }

  // Delete related records in dependency order first
  await prisma.accessGrant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.accessRequest.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });

  // Now safe to delete the users
  const result = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`Deleted ${result.count} test user(s). Admin account preserved.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
