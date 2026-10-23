/**
 * Policy acceptance (NEW-FEAT §3, §4; Phase 4b): Terms, Privacy and the
 * System Use Notice, recorded in ContentAcceptance.
 *
 * A user is up to date for a policy once they've accepted any version
 * published at or after its required version (services/content.ts), so a
 * minor fix never re-prompts and "Publish & require re-acceptance"
 * re-prompts everyone. The required versions come from the content cache;
 * the per-user check is one indexed query.
 *
 * Every authenticated path enforces this: requireAuth, the SSE stream
 * (routes/misc.ts) and the Discord resolver (routes/integrations.ts).
 */
import { prisma } from "../lib/prismaClient";
import { GATED_KEYS } from "../config/contentRegistry";
import { getCurrent, getState, VersionMeta } from "./content";

export type AcceptanceVia = "registration" | "gate";

export interface PendingAcceptance {
  key: string;
  title: string | null;
  currentVersion: string;
  requiredVersion: string;
  changeNote: string; // from the required (re-acceptance) version: "What changed"
  publishedAt: string; // when the required version was published
  firstTime: boolean; // never accepted any version of this policy
}

/** Gated policies the user still has to accept. Empty = up to date. */
export async function pendingAcceptances(userId: string): Promise<PendingAcceptance[]> {
  const state = await getState();
  const needed = GATED_KEYS.filter((key) => state.required.has(key));
  if (!needed.length) return [];

  const accepted = await prisma.contentAcceptance.findMany({
    where: { userId, key: { in: needed } },
    select: { key: true, contentVersionId: true },
  });

  const pending: PendingAcceptance[] = [];
  for (const key of needed) {
    const req = state.required.get(key)!;
    const versions = state.versions.get(key) ?? [];
    const ok = new Set(
      versions.filter((v) => v.publishedAt.getTime() >= req.publishedAt.getTime()).map((v) => v.id),
    );
    const mine = accepted.filter((a) => a.key === key);
    if (mine.some((a) => ok.has(a.contentVersionId))) continue;
    const current = state.current.get(key)!;
    pending.push({
      key,
      title: current.title,
      currentVersion: current.version,
      requiredVersion: req.version,
      changeNote: req.changeNote,
      publishedAt: req.publishedAt.toISOString(),
      firstTime: mine.length === 0,
    });
  }
  return pending;
}

export async function hasPendingAcceptances(userId: string): Promise<boolean> {
  return (await pendingAcceptances(userId)).length > 0;
}

/**
 * Resolves {key, version} pairs to the current version rows. Each version
 * must be the current one (the text the user was shown); otherwise returns
 * the current versions so the client can reload them.
 */
export async function resolveCurrentVersions(
  items: { key: string; version: string }[],
): Promise<{ ok: true; versions: VersionMeta[] } | { ok: false; currentVersions: Record<string, string | null> }> {
  const versions: VersionMeta[] = [];
  const currentVersions: Record<string, string | null> = {};
  let stale = false;
  for (const { key, version } of items) {
    const current = await getCurrent(key);
    currentVersions[key] = current?.version ?? null;
    if (!current || current.version !== version) stale = true;
    else versions.push(current);
  }
  return stale ? { ok: false, currentVersions } : { ok: true, versions };
}

/** One ContentAcceptance row + one CONTENT_ACCEPTED audit row per version, in one transaction. */
export async function recordAcceptances(
  userId: string,
  versions: VersionMeta[],
  ip: string | null,
  via: AcceptanceVia,
): Promise<void> {
  await prisma.$transaction([
    prisma.contentAcceptance.createMany({
      data: versions.map((v) => ({ userId, contentVersionId: v.id, key: v.key, ipAddress: ip, via })),
      skipDuplicates: true,
    }),
    ...versions.map((v) =>
      prisma.auditLog.create({
        data: {
          userId,
          accountId: null,
          action: "CONTENT_ACCEPTED",
          metadata: { key: v.key, version: v.version, bodySha256: v.bodySha256, via },
          ipAddress: ip,
        },
      }),
    ),
  ]);
}
