/**
 * Admin-editable policies and banners (Phase 4b).
 *
 * Three tables: ContentVersion (published, immutable), ContentDraft (one per
 * key, never shown to users) and ContentAcceptance (services/legalAcceptance.ts).
 * Every edit saves a draft; only publish() changes what users see.
 *
 * A version's identity is its publish timestamp (ISO-8601 UTC, to the
 * second). For a policy:
 *   current  = its latest published version (what users are shown);
 *   required = its latest version published with requiresReacceptance.
 * A minor fix changes current but not required, so it never re-prompts.
 *
 * requireAuth checks acceptance on every request, so the version metadata
 * and current rows are held in an in-process cache: invalidated on publish,
 * and reloaded after CACHE_TTL_MS anyway so a second backend instance picks
 * up another instance's publish within a minute.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { prisma } from "../lib/prismaClient";
import {
  CONTENT_REGISTRY,
  ContentRegistryEntry,
  LEGACY_V1_VERSION,
  registryEntry,
} from "../config/contentRegistry";

const CACHE_TTL_MS = 60 * 1000;
const CHANGE_NOTE_MAX = 300;
const TITLE_MAX = 200;

export class ContentError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export interface VersionMeta {
  id: string;
  key: string;
  version: string;
  title: string | null;
  changeNote: string;
  publishedAt: Date;
  requiresReacceptance: boolean;
  draftBanner: boolean;
  bodySha256: string;
}

export interface CurrentItem extends VersionMeta {
  body: string;
}

interface CacheState {
  loadedAt: number;
  versions: Map<string, VersionMeta[]>; // per key, oldest first
  current: Map<string, CurrentItem>;
  required: Map<string, VersionMeta>;
}

const META_SELECT = {
  id: true,
  key: true,
  version: true,
  title: true,
  changeNote: true,
  publishedAt: true,
  requiresReacceptance: true,
  draftBanner: true,
  bodySha256: true,
} as const;

let cache: CacheState | null = null;
let loading: Promise<CacheState> | null = null;

async function loadState(): Promise<CacheState> {
  const rows = await prisma.contentVersion.findMany({
    select: META_SELECT,
    orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
  });

  const versions = new Map<string, VersionMeta[]>();
  for (const row of rows) {
    if (!registryEntry(row.key)) continue; // a key removed from the registry stays in history only
    const list = versions.get(row.key) ?? [];
    list.push(row);
    versions.set(row.key, list);
  }

  const required = new Map<string, VersionMeta>();
  const currentIds: string[] = [];
  for (const [key, list] of versions) {
    currentIds.push(list[list.length - 1].id);
    if (registryEntry(key)!.kind !== "policy") continue;
    const req = [...list].reverse().find((v) => v.requiresReacceptance);
    if (req) required.set(key, req);
  }

  const bodies = await prisma.contentVersion.findMany({
    where: { id: { in: currentIds } },
    select: { id: true, body: true },
  });
  const bodyById = new Map(bodies.map((b) => [b.id, b.body]));
  const current = new Map<string, CurrentItem>();
  for (const [key, list] of versions) {
    const meta = list[list.length - 1];
    current.set(key, { ...meta, body: bodyById.get(meta.id) ?? "" });
  }

  return { loadedAt: Date.now(), versions, current, required };
}

export async function getState(): Promise<CacheState> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;
  if (!loading) {
    loading = loadState()
      .then((state) => {
        cache = state;
        return state;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export function invalidateContentCache(): void {
  cache = null;
}

export async function getCurrent(key: string): Promise<CurrentItem | null> {
  return (await getState()).current.get(key) ?? null;
}

/** Every key's current item + the required version of each policy. */
export async function getAllCurrent(): Promise<{ items: CurrentItem[]; required: Record<string, string> }> {
  const state = await getState();
  const required: Record<string, string> = {};
  for (const [key, v] of state.required) required[key] = v.version;
  return { items: [...state.current.values()], required };
}

export async function getRequiredVersions(): Promise<Map<string, VersionMeta>> {
  return (await getState()).required;
}

/** Versions of `key` published at or after its required version (accepting any of them counts). */
export async function versionsSatisfying(key: string): Promise<VersionMeta[]> {
  const state = await getState();
  const req = state.required.get(key);
  if (!req) return [];
  return (state.versions.get(key) ?? []).filter((v) => v.publishedAt.getTime() >= req.publishedAt.getTime());
}

export async function listVersions(key: string): Promise<VersionMeta[]> {
  return [...((await getState()).versions.get(key) ?? [])].reverse();
}

export async function getVersion(key: string, version: string) {
  return prisma.contentVersion.findUnique({
    where: { key_version: { key, version } },
    select: { ...META_SELECT, body: true },
  });
}

// ─── Validation ─────────────────────────────────────────────────────────

const EXPLICIT_ID = /\s+\{#([a-z0-9][a-z0-9-]*)\}\s*$/;

/**
 * Same ids the frontend renderer gives headings: an explicit `{#id}` suffix
 * (ContentMarkdown's headingIds plugin), else rehype-slug's github-slugger
 * slug of the heading text, with -1, -2… on repeats.
 */
export function headingIds(markdown: string): string[] {
  const ids: string[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/);
    if (!m) continue;
    const explicit = m[1].match(EXPLICIT_ID);
    if (explicit) {
      ids.push(explicit[1]);
      continue;
    }
    const text = m[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "");
    let slug = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const n = seen.get(slug);
    seen.set(slug, (n ?? -1) + 1);
    if (n !== undefined) slug = `${slug}-${n + 1}`;
    ids.push(slug);
  }
  return ids;
}

export interface ContentWarnings {
  overLength: boolean;
  missingAnchors: string[];
  hasTbd: boolean;
}

export function checkContent(entry: ContentRegistryEntry, body: string): ContentWarnings {
  const ids = new Set(headingIds(body));
  return {
    overLength: body.length > entry.maxLength,
    missingAnchors: entry.requiredAnchors.filter((a) => !ids.has(a)),
    hasTbd: entry.kind === "policy" && body.includes("[TBD"),
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** ISO-8601 UTC to the second: 2026-11-02T14:05:12Z. */
function versionLabel(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function requireEntry(key: string): ContentRegistryEntry {
  const entry = registryEntry(key);
  if (!entry) throw new ContentError(404, "Unknown content key.");
  return entry;
}

// ─── Drafts ─────────────────────────────────────────────────────────────

function draftDiffers(
  entry: ContentRegistryEntry,
  draft: { title: string | null; body: string; draftBanner: boolean },
  current: CurrentItem | null,
): boolean {
  if (!current) return true;
  if (sha256(draft.body) !== current.bodySha256) return true;
  if (entry.kind !== "policy") return false;
  return (draft.title ?? null) !== (current.title ?? null) || draft.draftBanner !== current.draftBanner;
}

/** Draft + current + warnings for the editor. Admin-only callers. */
export async function getDraft(key: string) {
  const entry = requireEntry(key);
  const [draft, current] = await Promise.all([
    prisma.contentDraft.findUnique({
      where: { key },
      include: { updatedBy: { select: { id: true, name: true } } },
    }),
    getCurrent(key),
  ]);
  return {
    key,
    draft,
    current,
    staleBase: !!draft && (draft.basedOn ?? null) !== (current?.version ?? null),
    changed: !!draft && draftDiffers(entry, draft, current),
    warnings: draft ? checkContent(entry, draft.body) : null,
  };
}

export async function saveDraft(
  key: string,
  input: { title?: unknown; body?: unknown; draftBanner?: unknown },
  adminId: string,
) {
  const entry = requireEntry(key);
  if (typeof input.body !== "string") throw new ContentError(400, "body must be a string.");
  if (input.body.length > entry.maxLength) {
    throw new ContentError(400, `Too long: the limit is ${entry.maxLength.toLocaleString()} characters.`);
  }
  let title: string | null = null;
  let draftBanner = false;
  if (entry.kind === "policy") {
    if (typeof input.title !== "string" || !input.title.trim()) throw new ContentError(400, "A title is required.");
    if (input.title.length > TITLE_MAX) throw new ContentError(400, `Title is limited to ${TITLE_MAX} characters.`);
    title = input.title.trim();
    draftBanner = input.draftBanner === true;
  }

  const current = await getCurrent(key);
  await prisma.contentDraft.upsert({
    where: { key },
    // basedOn is fixed when the draft starts, so "someone published since
    // you started" stays true until the draft is discarded or published.
    create: { key, title, body: input.body, draftBanner, basedOn: current?.version ?? null, updatedById: adminId },
    update: { title, body: input.body, draftBanner, updatedById: adminId },
  });
  return getDraft(key);
}

export async function discardDraft(key: string): Promise<void> {
  requireEntry(key);
  await prisma.contentDraft.deleteMany({ where: { key } });
}

// ─── Publish ────────────────────────────────────────────────────────────

export interface PublishOptions {
  changeNote?: unknown;
  draftBanner?: unknown;
  requiresReacceptance?: unknown;
  allowTbd?: unknown;
}

export async function publish(key: string, opts: PublishOptions, adminId: string, ip: string | null): Promise<VersionMeta> {
  const entry = requireEntry(key);
  const draft = await prisma.contentDraft.findUnique({ where: { key } });
  if (!draft) throw new ContentError(400, "There is no draft to publish.");

  const changeNote = typeof opts.changeNote === "string" ? opts.changeNote.trim() : "";
  if (!changeNote || changeNote.length > CHANGE_NOTE_MAX) {
    throw new ContentError(400, `A change note of 1–${CHANGE_NOTE_MAX} characters is required.`);
  }

  let requiresReacceptance = false;
  let draftBanner = false;
  if (entry.kind === "policy") {
    // No default: the admin must choose re-acceptance or minor fix explicitly.
    if (typeof opts.requiresReacceptance !== "boolean") {
      throw new ContentError(400, "requiresReacceptance must be true or false for a policy.");
    }
    requiresReacceptance = opts.requiresReacceptance;
    draftBanner = typeof opts.draftBanner === "boolean" ? opts.draftBanner : draft.draftBanner;
  } else if (opts.requiresReacceptance !== undefined && opts.requiresReacceptance !== false) {
    throw new ContentError(400, "Banners have no acceptance; requiresReacceptance is not allowed.");
  }

  const warnings = checkContent(entry, draft.body);
  if (warnings.overLength) throw new ContentError(400, "The draft is over the length limit.");
  if (warnings.missingAnchors.length) {
    throw new ContentError(400, `Other screens link to headings that are missing: ${warnings.missingAnchors.map((a) => `#${a}`).join(", ")}.`, {
      missingAnchors: warnings.missingAnchors,
    });
  }
  if (entry.kind === "policy" && !draftBanner && warnings.hasTbd && opts.allowTbd !== true) {
    throw new ContentError(400, "The text still contains [TBD] placeholders. Keep the DRAFT banner on, or confirm publishing with them.", {
      hasTbd: true,
    });
  }

  const current = await getCurrent(key);
  if (!draftDiffers(entry, { ...draft, draftBanner }, current)) {
    throw new ContentError(400, "The draft is identical to the published version. Nothing to publish.");
  }

  const now = new Date();
  const version = versionLabel(now);
  const bodySha256 = sha256(draft.body);

  try {
    const [created] = await prisma.$transaction([
      prisma.contentVersion.create({
        data: {
          key,
          version,
          title: entry.kind === "policy" ? draft.title : null,
          body: draft.body,
          bodySha256,
          draftBanner,
          requiresReacceptance,
          changeNote,
          publishedAt: now,
          publishedById: adminId,
        },
        select: META_SELECT,
      }),
      prisma.contentDraft.delete({ where: { key } }),
      prisma.auditLog.create({
        data: {
          userId: adminId,
          accountId: null,
          action: "CONTENT_PUBLISHED",
          metadata: { key, version, bodySha256, changeNote, requiresReacceptance },
          ipAddress: ip,
        },
      }),
    ]);
    return created;
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new ContentError(409, "A version was published in this same second. Try again.");
    }
    throw error;
  } finally {
    invalidateContentCache();
  }
}

// ─── Seeding + Phase 4 backfill ────────────────────────────────────────

function seedDir(): string {
  // ts-node runs from src/config; the compiled app from dist/config, which
  // tsc doesn't copy .md files into, so fall back to the source tree.
  const candidates = [
    path.join(__dirname, "../config/content-seed"),
    path.resolve(__dirname, "../../src/config/content-seed"),
  ];
  return candidates.find((d) => fs.existsSync(d)) ?? candidates[0];
}

/**
 * Startup, idempotent. Inserts v1 (labelled "2026-10-23", the Phase 4
 * version) for any registry key with no published version, then backfills
 * Phase 4's User acceptance columns into ContentAcceptance so nobody is
 * re-prompted. Both steps skip what already exists.
 */
export async function seedContent(): Promise<void> {
  const existing = await prisma.contentVersion.groupBy({ by: ["key"] });
  const have = new Set(existing.map((e) => e.key));
  const dir = seedDir();
  let seeded = 0;

  for (const entry of CONTENT_REGISTRY) {
    if (have.has(entry.key)) continue;
    const file = path.join(dir, `${entry.key}.md`);
    if (!fs.existsSync(file)) {
      console.error(`[Startup] No seed file for content key ${entry.key} (${file}).`);
      continue;
    }
    const body = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim() + "\n";
    const isPolicy = entry.kind === "policy";
    await prisma.contentVersion.create({
      data: {
        key: entry.key,
        version: LEGACY_V1_VERSION,
        title: entry.defaultTitle,
        body,
        bodySha256: sha256(body),
        draftBanner: isPolicy,
        requiresReacceptance: isPolicy, // v1 is the required version
        changeNote: "Initial version",
        publishedAt: new Date(`${LEGACY_V1_VERSION}T00:00:00Z`),
      },
    });
    seeded++;
  }
  if (seeded) {
    invalidateContentCache();
    console.log(`[Startup] Seeded ${seeded} content item(s).`);
  }

  const v1 = await prisma.contentVersion.findMany({
    where: { key: { in: ["TERMS", "PRIVACY", "NOTICE"] }, version: LEGACY_V1_VERSION },
    select: { id: true, key: true },
  });
  const v1Id = new Map(v1.map((v) => [v.key, v.id]));

  const users = await prisma.user.findMany({
    where: {
      OR: [{ termsVersionAccepted: LEGACY_V1_VERSION }, { noticeVersionAcknowledged: LEGACY_V1_VERSION }],
    },
    select: {
      id: true,
      termsVersionAccepted: true,
      termsAcceptedAt: true,
      noticeVersionAcknowledged: true,
      noticeAcknowledgedAt: true,
    },
  });

  const rows: { userId: string; contentVersionId: string; key: string; acceptedAt: Date; via: string }[] = [];
  const add = (userId: string, key: string, at: Date | null, via: string) => {
    const id = v1Id.get(key);
    if (id) rows.push({ userId, contentVersionId: id, key, acceptedAt: at ?? new Date(), via });
  };
  for (const u of users) {
    // The Phase 4 checkbox covered "the Terms of Use and the Privacy notice".
    if (u.termsVersionAccepted === LEGACY_V1_VERSION) {
      add(u.id, "TERMS", u.termsAcceptedAt, "registration");
      add(u.id, "PRIVACY", u.termsAcceptedAt, "registration");
    }
    if (u.noticeVersionAcknowledged === LEGACY_V1_VERSION) {
      add(u.id, "NOTICE", u.noticeAcknowledgedAt, "gate");
    }
  }
  if (rows.length) {
    const { count } = await prisma.contentAcceptance.createMany({ data: rows, skipDuplicates: true });
    if (count) console.log(`[Startup] Backfilled ${count} Phase 4 acceptance(s) into ContentAcceptance.`);
  }
}
