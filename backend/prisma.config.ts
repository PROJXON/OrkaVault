import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI-only config (generate / db push / studio). The running app never
// reads this — it connects via the driver adapter in
// src/lib/prismaClient.ts using DATABASE_URL directly. This uses
// DIRECT_URL because that's the same non-pooled connection the old
// schema.prisma `directUrl` pointed CLI commands at pre-Prisma 7.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
