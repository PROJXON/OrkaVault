// Single shared PrismaClient for the whole app. Prisma 7 requires a driver
// adapter instead of letting PrismaClient manage its own connection —
// every route/service/script must import `prisma` from here rather than
// constructing its own PrismaClient, otherwise each call site would open
// its own connection pool (PrismaPg manages a pool internally per instance).
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
export * from "../generated/prisma/client";
