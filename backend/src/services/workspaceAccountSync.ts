/**
 * Auto-provisions vault Account entries for Google Workspace accounts
 * that don't have one yet. Distinct from googleWorkspace.ts, which owns
 * Workspace *monitoring* (Reports API events, Directory API connected
 * apps) — this is Account provisioning, a different concern.
 *
 * These entries track break-glass/offboarding access to each person's
 * own Workspace login, not a shared password OrkaVault needs to store —
 * hence isGoogleSSO: true / secretRef: "SSO_ONLY", the same sentinel
 * already used when an admin manually checks "uses Google SSO".
 *
 * Create-only: never updates/overwrites an existing Account, no matter
 * how its name/owner/etc. has drifted from what Workspace now reports.
 * Admin-triggered only (POST /api/accounts/sync-workspace) — no cron.
 */
import { prisma } from "../lib/prismaClient";
import { listActiveWorkspaceUsers } from "./googleWorkspace";


export interface WorkspaceAccountSyncResult {
  created: number;
  skipped: number;
}

export async function syncWorkspaceAccountsToVault(
  triggeredByUserId: string,
): Promise<WorkspaceAccountSyncResult> {
  const workspaceUsers = await listActiveWorkspaceUsers();

  // Match against ANY existing Account (any platformType), not just ones
  // already tagged GOOGLE_WORKSPACE — the goal is "don't duplicate an
  // account already tracked in the vault", regardless of how it was
  // originally categorized. Case-insensitive since email casing varies.
  const existing = await prisma.account.findMany({ select: { username: true } });
  const existingUsernames = new Set(existing.map((a) => a.username.toLowerCase()));

  const toCreate = workspaceUsers.filter(
    (u) => !existingUsernames.has(u.email.toLowerCase()),
  );

  let created = 0;
  for (const u of toCreate) {
    const owner = await prisma.user.findFirst({ where: { email: u.email } });
    const ownerId = owner?.id ?? triggeredByUserId;

    const account = await prisma.account.create({
      data: {
        name: u.displayName || u.email,
        username: u.email,
        platformType: "GOOGLE_WORKSPACE",
        isGoogleSSO: true,
        secretRef: "SSO_ONLY",
        ownerId,
        qaStatus: "APPROVED",
        refreshCycle: "MANUAL", // no real secret to rotate
        createdBy: triggeredByUserId,
        notes: owner
          ? "[AUTO-SYNCED] Created from Google Workspace directory sync."
          : "[AUTO-SYNCED] Created from Google Workspace directory sync — no matching OrkaVault user found; owner defaulted to the admin who ran the sync. Verify/reassign if needed.",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: triggeredByUserId,
        accountId: account.id,
        action: "WORKSPACE_ACCOUNT_AUTO_CREATED",
        metadata: { email: u.email },
      },
    });

    created++;
  }

  return { created, skipped: workspaceUsers.length - toCreate.length };
}
