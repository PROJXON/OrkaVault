/**
 * Content Routes — admin-editable policies and banners (Phase 4b). See
 * services/content.ts for the draft → publish model.
 *
 * Public: the current text of everything (never drafts), and the version
 * history of policies. ADMIN only: drafts, publishing, banner history.
 * No route updates or deletes a ContentVersion or ContentAcceptance row.
 */
import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prismaClient";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { asString, clientIp } from "../utils/reqValue";
import { CONTENT_REGISTRY, registryEntry } from "../config/contentRegistry";
import {
  ContentError,
  VersionMeta,
  discardDraft,
  getAllCurrent,
  getDraft,
  getVersion,
  listVersions,
  publish,
  saveDraft,
} from "../services/content";

const router = Router();

// Minor-fix and banner change notes are written for admins ("Internal: what
// was fixed"), so public responses only carry the note of a re-acceptance
// version, which users see as "What changed".
function publicMeta(v: VersionMeta) {
  return {
    key: v.key,
    version: v.version,
    title: v.title,
    publishedAt: v.publishedAt,
    draftBanner: v.draftBanner,
    requiresReacceptance: v.requiresReacceptance,
    changeNote: v.requiresReacceptance ? v.changeNote : null,
  };
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ContentError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  console.error(`[Content] ${fallback}`, error);
  res.status(500).json({ error: fallback });
}

// Policy history is public (the legal pages' "Previous versions"); banner
// history is admin-only.
function publicForPolicies(req: Request, res: Response, next: NextFunction) {
  const entry = registryEntry(asString(req.params.key) ?? "");
  if (!entry) {
    res.status(404).json({ error: "Unknown content key." });
    return;
  }
  if (entry.kind === "policy") {
    next();
    return;
  }
  requireAuth(req as AuthenticatedRequest, res, () => requireRole("ADMIN")(req as AuthenticatedRequest, res, next));
}

// GET /api/content/current — every key's current text + each policy's
// required version [PUBLIC: legal pages and pre-auth banners need it]
router.get("/current", async (_req: Request, res: Response) => {
  try {
    const { items, required } = await getAllCurrent();
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      items: items.map((item) => ({ ...publicMeta(item), body: item.body })),
      required,
    });
  } catch (error) {
    sendError(res, error, "Failed to load content.");
  }
});

// GET /api/content/me/acceptances — the caller's own acceptance history
// (Profile → "My agreements")
router.get("/me/acceptances", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await prisma.contentAcceptance.findMany({
      where: { userId: req.user!.id },
      orderBy: { acceptedAt: "desc" },
      select: {
        key: true,
        acceptedAt: true,
        via: true,
        contentVersion: { select: { version: true, title: true, publishedAt: true, requiresReacceptance: true } },
      },
    });
    res.json(
      rows.map((r) => ({
        key: r.key,
        version: r.contentVersion.version,
        title: r.contentVersion.title,
        publishedAt: r.contentVersion.publishedAt,
        requiresReacceptance: r.contentVersion.requiresReacceptance,
        acceptedAt: r.acceptedAt,
        via: r.via,
      })),
    );
  } catch (error) {
    sendError(res, error, "Failed to load your agreements.");
  }
});

// GET /api/content/admin/summary — Settings → Content list [ADMIN]
router.get("/admin/summary", requireAuth, requireRole("ADMIN"), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [{ items }, drafts, activeUsers] = await Promise.all([
      getAllCurrent(),
      prisma.contentDraft.findMany({
        select: { key: true, updatedAt: true, updatedBy: { select: { name: true } } },
      }),
      prisma.user.count({ where: { active: true } }),
    ]);
    const currentByKey = new Map(items.map((i) => [i.key, i]));
    const draftByKey = new Map(drafts.map((d) => [d.key, d]));
    res.json({
      activeUsers,
      items: CONTENT_REGISTRY.map((e) => {
        const current = currentByKey.get(e.key);
        const draft = draftByKey.get(e.key);
        return {
          key: e.key,
          kind: e.kind,
          label: e.label,
          acceptance: e.acceptance,
          maxLength: e.maxLength,
          requiredAnchors: e.requiredAnchors,
          current: current
            ? { version: current.version, publishedAt: current.publishedAt, requiresReacceptance: current.requiresReacceptance }
            : null,
          draft: draft ? { updatedAt: draft.updatedAt, updatedBy: draft.updatedBy?.name ?? null } : null,
        };
      }),
    });
  } catch (error) {
    sendError(res, error, "Failed to load content summary.");
  }
});

// GET /api/content/:key/versions — version list, newest first
// [PUBLIC for policies, ADMIN for banners]
router.get("/:key/versions", publicForPolicies, async (req: Request, res: Response) => {
  try {
    const versions = await listVersions(asString(req.params.key)!);
    res.json(versions.map(publicMeta));
  } catch (error) {
    sendError(res, error, "Failed to load versions.");
  }
});

// GET /api/content/:key/versions/:version — one exact version's text
// [PUBLIC for policies, ADMIN for banners]
router.get("/:key/versions/:version", publicForPolicies, async (req: Request, res: Response) => {
  try {
    const row = await getVersion(asString(req.params.key)!, asString(req.params.version) ?? "");
    if (!row) {
      res.status(404).json({ error: "Version not found." });
      return;
    }
    res.json({ ...publicMeta(row), body: row.body });
  } catch (error) {
    sendError(res, error, "Failed to load version.");
  }
});

// GET /api/content/:key/history — admin history: publisher, internal change
// note, re-acceptance vs minor fix, acceptance counts [ADMIN]
router.get("/:key/history", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  const key = asString(req.params.key) ?? "";
  if (!registryEntry(key)) {
    res.status(404).json({ error: "Unknown content key." });
    return;
  }
  try {
    const [rows, counts] = await Promise.all([
      prisma.contentVersion.findMany({
        where: { key },
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        select: {
          id: true,
          version: true,
          title: true,
          changeNote: true,
          publishedAt: true,
          requiresReacceptance: true,
          draftBanner: true,
          bodySha256: true,
          publishedBy: { select: { name: true } },
        },
      }),
      prisma.contentAcceptance.groupBy({ by: ["contentVersionId"], where: { key }, _count: { _all: true } }),
    ]);
    const countById = new Map(counts.map((c) => [c.contentVersionId, c._count._all]));
    res.json(
      rows.map(({ id, publishedBy, ...v }) => ({
        ...v,
        publishedBy: publishedBy?.name ?? null,
        acceptedBy: countById.get(id) ?? 0,
      })),
    );
  } catch (error) {
    sendError(res, error, "Failed to load history.");
  }
});

// GET /api/content/:key/draft — the draft (or null), current version,
// staleBase and validation warnings [ADMIN]
router.get("/:key/draft", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getDraft(asString(req.params.key) ?? ""));
  } catch (error) {
    sendError(res, error, "Failed to load draft.");
  }
});

// PUT /api/content/:key/draft — autosave. Creates the draft (based on the
// current version) if missing. Never changes what users see. [ADMIN]
router.put("/:key/draft", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await saveDraft(asString(req.params.key) ?? "", req.body ?? {}, req.user!.id));
  } catch (error) {
    sendError(res, error, "Failed to save draft.");
  }
});

// DELETE /api/content/:key/draft — discard the draft [ADMIN]
router.delete("/:key/draft", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await discardDraft(asString(req.params.key) ?? "");
    res.json({ message: "Draft discarded." });
  } catch (error) {
    sendError(res, error, "Failed to discard draft.");
  }
});

// POST /api/content/:key/publish — publish the draft as a new immutable
// version. Body: {changeNote, requiresReacceptance (policies: required,
// banners: not allowed), draftBanner?, allowTbd?} [ADMIN]
router.post("/:key/publish", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = await publish(asString(req.params.key) ?? "", req.body ?? {}, req.user!.id, clientIp(req));
    res.status(201).json(publicMeta(version));
  } catch (error) {
    sendError(res, error, "Failed to publish.");
  }
});

export default router;
