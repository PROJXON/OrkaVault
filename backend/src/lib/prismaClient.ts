// Single shared PrismaClient for the whole app. Prisma 7 requires a driver
// adapter instead of letting PrismaClient manage its own connection —
// every route/service/script must import `prisma` from here rather than
// constructing its own PrismaClient, otherwise each call site would open
// its own connection pool (PrismaPg manages a pool internally per instance).
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Unlike Prisma's own engine (used by the `prisma` CLI), node-postgres does
// not negotiate TLS automatically — against Supabase's pooler that leaves
// the connection hanging on the handshake until it times out
// (`(EAUTHTIMEOUT) timeout while waiting for message`) instead of failing
// fast, so ssl must be configured explicitly.
//
// Supabase's pooler (*.pooler.supabase.com) serves a cert chain signed by
// Supabase's own private CA ("Supabase Root 2021 CA"), not a publicly
// trusted one — verified directly via `openssl s_client` against the prod
// pooler host. Node's default trust store won't recognize it, so plain
// `ssl: true` fails certificate verification. The fix is to pin that root
// CA explicitly (public information, not a secret — safe to commit) and
// keep full verification on, NOT to set rejectUnauthorized: false, which
// would accept any certificate from anyone and defeat TLS's protection
// against a machine-in-the-middle — unacceptable for an app that moves
// vault credentials over this connection.
//
// Only do this when DATABASE_URL is actually Supabase's pooler, though —
// a local/Docker Postgres (dev) has no SSL listener at all, and forcing
// this ssl block against it fails the handshake outright ("the server
// does not support SSL connections", P1011) before a single query runs.
const SUPABASE_CA_PATH = path.join(__dirname, "../../certs/supabase-root-2021-ca.pem");
const isSupabase = (process.env.DATABASE_URL || "").includes(".pooler.supabase.com");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ...(isSupabase && {
    ssl: {
      ca: fs.readFileSync(SUPABASE_CA_PATH, "utf-8"),
      rejectUnauthorized: true,
    },
  }),
});

export const prisma = new PrismaClient({ adapter });
export * from "../generated/prisma/client";
