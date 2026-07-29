/**
 * Audit log retention — sweeps AuditLog rows older than the configured
 * retention window out to a CSV file under backend/backups/, then purges
 * them from Postgres. Controlled by two OrganizationPolicy rows:
 *   AUDIT_LOG_RETENTION_DAYS — age (days) at which a log row gets backed
 *     up + purged. Unset/blank/non-numeric = retention disabled (keep
 *     everything, sweep is a no-op).
 *   MAX_AUDIT_BACKUPS — how many backup CSVs to keep on disk; oldest
 *     files beyond this count are deleted after each sweep. Defaults to
 *     10 if unset.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

export const BACKUPS_DIR = path.join(process.cwd(), "backups");
const DEFAULT_MAX_BACKUPS = 10;
const FILENAME_RE = /^audit-log-backup-[0-9T:.\-]+\.csv$/;

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

async function getPolicyValue(name: string): Promise<string | null> {
  const policy = await prisma.organizationPolicy.findFirst({ where: { name } });
  if (!policy || !policy.enabled) return null;
  return policy.value ?? null;
}

export async function getRetentionDays(): Promise<number | null> {
  const raw = await getPolicyValue("AUDIT_LOG_RETENTION_DAYS");
  const days = parseInt(raw || "", 10);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export async function getMaxBackups(): Promise<number> {
  const raw = await getPolicyValue("MAX_AUDIT_BACKUPS");
  const max = parseInt(raw || "", 10);
  return Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_BACKUPS;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = typeof value === "string" ? value : JSON.stringify(value);
  // Neutralize CSV/formula injection (CWE-1236): actorName/actorEmail/
  // actorDepartment below come from User fields an attacker controls at
  // self-registration, and this file is meant to be opened by an admin in
  // Excel/Sheets — a leading =/+/-/@ would otherwise be interpreted as a
  // formula. Prefixing with a quote is the standard mitigation (renders
  // as literal text, not evaluated).
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function enforceMaxBackups(maxBackups: number): number {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => FILENAME_RE.test(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  const toDelete = files.slice(maxBackups);
  for (const f of toDelete) fs.unlinkSync(path.join(BACKUPS_DIR, f.name));
  return toDelete.length;
}

/** Runs the retention sweep. Safe to call on a schedule or on demand. */
export async function runAuditRetentionSweep(): Promise<{
  skipped: boolean;
  backedUp: number;
  file: string | null;
  deletedBackups: number;
}> {
  const retentionDays = await getRetentionDays();
  if (retentionDays === null) {
    return { skipped: true, backedUp: 0, file: null, deletedBackups: 0 };
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const logs = await prisma.auditLog.findMany({
    where: { timestamp: { lt: cutoff } },
    include: {
      user: { select: { name: true, email: true, department: true } },
      account: { select: { name: true } },
    },
    orderBy: { timestamp: "asc" },
  });

  const maxBackups = await getMaxBackups();
  if (logs.length === 0) {
    const deletedBackups = fs.existsSync(BACKUPS_DIR) ? enforceMaxBackups(maxBackups) : 0;
    return { skipped: false, backedUp: 0, file: null, deletedBackups };
  }

  ensureBackupsDir();
  const header = ["timestamp", "action", "actorName", "actorEmail", "actorDepartment", "accountName", "ipAddress", "metadata"];
  const rows = logs.map((l) =>
    [
      l.timestamp.toISOString(),
      l.action,
      l.user?.name,
      l.user?.email,
      l.user?.department,
      l.account?.name,
      l.ipAddress,
      l.metadata,
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n") + "\n";

  const filename = `audit-log-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  fs.writeFileSync(path.join(BACKUPS_DIR, filename), csv, "utf8");

  // Only purge from Postgres once the backup file is safely on disk.
  await prisma.auditLog.deleteMany({ where: { id: { in: logs.map((l) => l.id) } } });

  const deletedBackups = enforceMaxBackups(maxBackups);
  return { skipped: false, backedUp: logs.length, file: filename, deletedBackups };
}

export function listBackups(): { filename: string; sizeBytes: number; createdAt: string }[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => FILENAME_RE.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Validates a filename came from listBackups() before touching the filesystem with it. */
export function isValidBackupFilename(filename: string): boolean {
  return FILENAME_RE.test(filename) && !filename.includes("..") && !filename.includes("/");
}
