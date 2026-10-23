const { PrismaClient } = require('@prisma/client');
const client = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function run() {
  try {
    await client.$executeRawUnsafe('ALTER TYPE "Role" ADD VALUE IF NOT EXISTS \'USER\';');
  } catch(e) { console.log(e.message); }
  
  try {
    await client.$executeRawUnsafe('UPDATE "User" SET role = \'USER\' WHERE role::text = \'HOLDER\';');
  } catch(e) { console.log(e.message); }
  
  console.log('Done updating remote DB.');
  await client.$disconnect();
}
run();
