import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEPARTMENTS = ["IT", "HR", "Marketing", "Business", "GAP", "Operation"];
const CLEARANCES = [
  "Tier 1 - Standard",
  "Tier 2 - Elevated",
  "Tier 3 - Executive",
];

async function main() {
  const users = await prisma.user.findMany();
  let count = 0;

  for (const user of users) {
    const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
    const clearance = CLEARANCES[Math.floor(Math.random() * CLEARANCES.length)];
    const isInternational = Math.random() > 0.8; // 20% chance

    await prisma.user.update({
      where: { id: user.id },
      data: {
        department: dept,
        clearanceLevel: clearance,
        internationalAccess: isInternational,
      },
    });
    count++;
  }
  console.log(`Updated ${count} users with mock department/clearance data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
