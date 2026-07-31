import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI-only config (generate / db push / studio). The running app never
// reads this — it connects via the driver adapter in
// src/lib/prismaClient.ts using DATABASE_URL directly. This uses
// DIRECT_URL because that's the same non-pooled connection the old
// schema.prisma `directUrl` pointed CLI commands at pre-Prisma 7.
//
// `generate` doesn't open a DB connection at all (it only reads the
// schema file), but this config is loaded for every CLI command, so an
// unconditional env("DIRECT_URL") would fail `generate` in environments
// that never set DIRECT_URL — e.g. a Docker build stage that has no
// access to real credentials. Only resolve it when it's actually
// present; commands that need it (db push, studio) still get it, and
// still fail loudly if it's genuinely missing where it's required.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ? env("DIRECT_URL") : undefined,
  },
});
