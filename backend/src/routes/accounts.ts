/**
 * Account Routes — CRUD, QA Approval, Reveal
 */
import { Router, Response } from "express";
import { prisma } from "../lib/prismaClient";
import crypto from "crypto";
import multer from "multer";
import {
  requireAuth,
  requireRole,
  isAccountInManagerScope,
  AuthenticatedRequest,
} from "../middleware/auth";
import {
  storeSecret,
  fetchSecret,
  updateSecret,
  deleteSecret,
} from "../services/secretManager";
import { scorePassword } from "../services/health";
import { notifyAdmins, notifyUser } from "../services/notifications";
import { parseCsv } from "../services/csvImport";
import { meetsClearance } from "../services/clearance";
import { validateTotpQrImage, generateOtpFromQrImage } from "../services/totp";
import { syncWorkspaceAccountsToVault } from "../services/workspaceAccountSync";
import { asString } from "../utils/reqValue";

const router = Router();

// Bulk-import CSVs are parsed in memory and never written to disk —
// they carry plaintext passwords, same trust boundary as the single
// add-entry JSON body.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only .csv files are allowed"));
    }
  },
});

// FINANCE exists in the Prisma enum but isn't selectable anywhere in the
// UI (AddEntryModal/EditEntryModal only offer these two) — bulk import
// is restricted to the same set so it can't create accounts the rest of
// the app has no way to display or edit correctly.
const PLATFORM_TYPES = ["GOOGLE_WORKSPACE", "THIRD_PARTY"];
const REFRESH_CYCLES = ["MONTHLY", "FOUR_MONTHS", "SIX_MONTHS", "ANNUALLY", "MANUAL"];
const MAX_IMPORT_ROWS = 500;
const QR_PENDING_NOTE_PREFIX =
  "[QR PENDING] Authenticator QR code not yet uploaded — add via Edit before granting access.";

// Org policy gate for whether a TOTP QR is mandatory on GOOGLE_WORKSPACE
// entries. Defaults to required (current behavior) when the policy row
// doesn't exist or is explicitly enabled.
async function isTotpQrRequired(): Promise<boolean> {
  const policy = await prisma.organizationPolicy.findFirst({
    where: { name: "REQUIRE_TOTP_QR" },
  });
  if (!policy) return true;
  return policy.enabled && policy.value !== "false";
}

// GET /api/accounts — list all APPROVED accounts [ALL active]
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accounts = await prisma.account.findMany({
      where: { qaStatus: "APPROVED" },
      include: {
        accessGrants: {
          where: {
            userId: req.user!.id,
            active: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Owner name/email for admin-facing UI (e.g. Force Rotate confirmation).
    // ownerId isn't a Prisma relation on Account, so batch-resolve it here.
    let ownersById: Record<string, { name: string; email: string }> = {};
    if (req.user!.role === "ADMIN") {
      const owners = await prisma.user.findMany({
        where: { id: { in: [...new Set(accounts.map((a) => a.ownerId))] } },
        select: { id: true, name: true, email: true },
      });
      ownersById = Object.fromEntries(owners.map((o) => [o.id, { name: o.name, email: o.email }]));
    }

    res.json(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        username: a.username,
        platformType: a.platformType,
        ownerId: a.ownerId,
        ownerName: ownersById[a.ownerId]?.name || null,
        ownerEmail: ownersById[a.ownerId]?.email || null,
        healthScore: a.healthScore,
        healthLabel: a.healthLabel,
        refreshCycle: a.refreshCycle,
        nextRotationDue: a.nextRotationDue,
        qaStatus: a.qaStatus,
        notes: a.notes,
        collectionId: a.collectionId,
        requiredClearance: a.requiredClearance,
        createdAt: a.createdAt,
        createdBy: a.createdBy,
        hasTotpQr: !!a.totpQrBase64,
        isGoogleSSO: a.isGoogleSSO,
        hasGrant: a.accessGrants.length > 0,
        grantExpiresAt: a.accessGrants[0]?.expiresAt || null,
        grantFirstRevealedAt: a.accessGrants[0]?.firstRevealedAt || null,
      })),
    );
  },
);

// GET /api/accounts/:id — single account metadata [ALL active]
router.get(
  "/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const account = await prisma.account.findUnique({
      where: { id: asString(req.params.id) },
      include: {
        accessGrants: {
          where: { active: true },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!account) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    // Same non-secret metadata every user already sees via GET / (the list
    // route) — but never totpQrBase64/passwordHash/secretRef (secret-adjacent;
    // reveal-otp/reveal-qr are the only routes allowed to hand those out, and
    // only after their own grant/clearance/manager-scope checks), and other
    // grant-holders' identities are ADMIN-only, matching ownersById above.
    // Also excludes a grant past its expiresAt (the 24h "must view by"
    // deadline pre-reveal, or the real access window post-reveal) — it's
    // still `active: true` in the DB until services/staleApprovals.ts's
    // sweep catches up, but shouldn't read as a live grant in the meantime.
    const now = new Date();
    const myGrant = account.accessGrants.find(
      (g) => g.userId === req.user!.id && (g.expiresAt === null || g.expiresAt > now),
    );
    res.json({
      id: account.id,
      name: account.name,
      username: account.username,
      platformType: account.platformType,
      ownerId: account.ownerId,
      healthScore: account.healthScore,
      healthLabel: account.healthLabel,
      refreshCycle: account.refreshCycle,
      nextRotationDue: account.nextRotationDue,
      qaStatus: account.qaStatus,
      notes: account.notes,
      collectionId: account.collectionId,
      requiredClearance: account.requiredClearance,
      createdAt: account.createdAt,
      createdBy: account.createdBy,
      hasTotpQr: !!account.totpQrBase64,
      isGoogleSSO: account.isGoogleSSO,
      hasGrant: !!myGrant,
      grantExpiresAt: myGrant?.expiresAt || null,
      grantFirstRevealedAt: myGrant?.firstRevealedAt || null,
      accessGrants:
        req.user!.role === "ADMIN"
          ? account.accessGrants.map((g) => ({
              userId: g.userId,
              name: g.user.name,
              email: g.user.email,
              expiresAt: g.expiresAt,
            }))
          : undefined,
    });
  },
);

// POST /api/accounts — submit new entry to QA queue [MANAGER+]
// BUG 4 DEFENSE: duplicate check on name + username
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, username, platformType, password, refreshCycle, notes, collectionId, totpQrBase64, isGoogleSSO, requiredClearance } = req.body;

    if (!name || !username || !platformType) {
      res.status(400).json({
        error: "Name, username, and platformType are required.",
      });
      return;
    }

    if (!isGoogleSSO && !password) {
      res.status(400).json({ error: "Password is required unless using Google SSO." });
      return;
    }

    if (platformType === "GOOGLE_WORKSPACE" && !isGoogleSSO && !totpQrBase64 && (await isTotpQrRequired())) {
      res.status(400).json({ error: "An Authenticator QR Code is required for Google Workspace accounts." });
      return;
    }

    if (totpQrBase64) {
      try {
        await validateTotpQrImage(totpQrBase64);
      } catch (e: any) {
        res.status(400).json({ error: e.message || "Could not read a valid authenticator QR code from that image." });
        return;
      }
    }

    // Duplicate check
    const existing = await prisma.account.findFirst({
      where: { name, username },
    });
    if (existing) {
      res.status(409).json({ error: "An account with this name and username already exists." });
      return;
    }

    // Hash the password for reuse detection (if not SSO)
    let pHash = null;
    let sRef = "SSO_ONLY";

    if (!isGoogleSSO && password) {
      pHash = crypto.createHash("sha256").update(password).digest("hex");
      sRef = await storeSecret(password);
    }

    try {
      let score = 100;
      let label = "STRONG";
      
      if (!isGoogleSSO) {
        const result = scorePassword(password);
        score = result.score;
        label = result.label;
      }
      
      // Password Reuse Detection (#14) (Only if not SSO)
      if (!isGoogleSSO && pHash) {
        const reusedAccount = await prisma.account.findFirst({
          where: { passwordHash: pHash }
        });
        if (reusedAccount) {
          notifyAdmins(
            "Password Reuse Detected",
            `The password for "${name}" is identical to an existing account ("${reusedAccount.name}").`,
            "PASSWORD_WEAK"
          );
        }
      }

      // ADMIN entries are auto-approved; MANAGER entries go through QA
      const isAdmin = req.user!.role === "ADMIN";
      const qaStatus = isAdmin ? "APPROVED" : "PENDING";
      const cycle = refreshCycle || "FOUR_MONTHS";

      const account = await prisma.account.create({
        data: {
          name,
          username,
          platformType,
          secretRef: sRef,
          ownerId: req.user!.id,
          healthScore: score,
          healthLabel: label as any,
          refreshCycle: cycle,
          notes,
          passwordHash: pHash,
          totpQrBase64,
          isGoogleSSO,
          qaStatus,
          collectionId: collectionId === "" ? null : collectionId,
          requiredClearance: requiredClearance || null,
          createdBy: req.user!.id,
        },
      });

      // If admin, also auto-create rotation schedule
      if (isAdmin) {
        const cycleDurations: Record<string, number> = {
          MONTHLY: 30,
          FOUR_MONTHS: 120,
          SIX_MONTHS: 180,
          ANNUALLY: 365,
          MANUAL: 365 * 10,
        };
        const daysUntilDue = cycleDurations[cycle] || 120;
        const nextDue = new Date(
          Date.now() + daysUntilDue * 24 * 60 * 60 * 1000,
        );
        await prisma.rotationSchedule.create({
          data: { accountId: account.id, cycle, nextDue },
        });
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: account.id,
          action: isAdmin ? "ACCOUNT_CREATED" : "ACCOUNT_SUBMITTED",
          ipAddress: req.ip,
        },
      });

      // Only notify admins for QA if not self-approved
      if (!isAdmin) {
        notifyAdmins(
          "New Entry for QA Review",
          `${req.user!.name} submitted "${name}" for QA approval.`,
          "NEW_ENTRY_QA",
        );
      }

      // If weak password, alert admins + owner
      if (score < 40) {
        notifyUser(
          req.user!.id,
          "Weak Password Alert",
          `The password for "${name}" scored ${score}/100. Consider using a stronger password.`,
          "PASSWORD_WEAK",
        );
        notifyAdmins(
          "Weak Password Submitted",
          `"${name}" has a health score of ${score}/100.`,
          "PASSWORD_WEAK",
        );
      }

      res.status(201).json({
        id: account.id,
        name: account.name,
        healthScore: score,
        healthLabel: label,
        qaStatus,
      });
    } catch (error) {
      console.error("[Account Create]", error);
      res.status(500).json({ error: "Failed to create account." });
    }
  },
);

// POST /api/accounts/bulk-import — CSV bulk creation [ADMIN]
// GOOGLE_WORKSPACE rows never carry a TOTP QR (can't fit one in a CSV
// cell sensibly) — they're always created with a note flagging the QR
// as pending, regardless of the REQUIRE_TOTP_QR policy. Rows are
// processed sequentially (not in a transaction) so one bad row doesn't
// abort the rest of the batch; each row gets its own pass/fail result.
router.post(
  "/bulk-import",
  requireAuth,
  requireRole("ADMIN"),
  csvUpload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "CSV file is required." });
      return;
    }

    let rows: Record<string, string>[];
    try {
      rows = parseCsv(req.file.buffer.toString("utf-8"));
    } catch (error) {
      res.status(400).json({ error: "Could not parse CSV file." });
      return;
    }

    if (rows.length === 0) {
      res.status(400).json({ error: "CSV file has no data rows." });
      return;
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      res.status(400).json({ error: `CSV exceeds the ${MAX_IMPORT_ROWS}-row import limit.` });
      return;
    }

    const results: Array<{
      row: number;
      name: string;
      status: "created" | "error";
      error?: string;
      id?: string;
      qrPending?: boolean;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header is row 1
      const r = rows[i];
      const name = r.name;
      const username = r.username;
      const platformType = r.platformType;
      const password = r.password;
      const isGoogleSSO = (r.isGoogleSSO || "").toLowerCase() === "true";
      const refreshCycle = r.refreshCycle || "FOUR_MONTHS";
      const notesInput = r.notes || "";
      const collectionName = r.collection || "";

      const fail = (error: string) => {
        results.push({ row: rowNum, name: name || "(missing name)", status: "error", error });
      };

      if (!name || !username || !platformType) {
        fail("Name, username, and platformType are required.");
        continue;
      }
      if (!PLATFORM_TYPES.includes(platformType)) {
        fail(`platformType must be one of ${PLATFORM_TYPES.join(", ")}.`);
        continue;
      }
      if (!REFRESH_CYCLES.includes(refreshCycle)) {
        fail(`refreshCycle must be one of ${REFRESH_CYCLES.join(", ")}.`);
        continue;
      }
      if (!isGoogleSSO && !password) {
        fail("Password is required unless isGoogleSSO is true.");
        continue;
      }

      let collectionId: string | null = null;
      if (collectionName) {
        try {
          let collection = await prisma.collection.findFirst({
            where: { name: { equals: collectionName, mode: "insensitive" } },
          });
          if (!collection) {
            // Auto-create: ADMIN already has standalone power to create
            // Collections via POST /api/collections, so doing it inline
            // here isn't a privilege escalation, just a convenience for
            // first-time imports referencing a not-yet-created group.
            collection = await prisma.collection.create({ data: { name: collectionName } });
          }
          collectionId = collection.id;
        } catch (error) {
          // Handles a same-name race between two rows/requests creating
          // the collection concurrently (unique constraint on name).
          const existing = await prisma.collection.findFirst({
            where: { name: { equals: collectionName, mode: "insensitive" } },
          });
          if (!existing) {
            fail(`Failed to resolve or create collection "${collectionName}".`);
            continue;
          }
          collectionId = existing.id;
        }
      }

      const existing = await prisma.account.findFirst({ where: { name, username } });
      if (existing) {
        fail(`An account with this name and username already exists.`);
        continue;
      }

      const qrPending = platformType === "GOOGLE_WORKSPACE" && !isGoogleSSO;
      const notes = qrPending
        ? `${QR_PENDING_NOTE_PREFIX}${notesInput ? "\n" + notesInput : ""}`
        : notesInput || undefined;

      try {
        let pHash: string | null = null;
        let sRef = "SSO_ONLY";
        let score = 100;
        let label = "STRONG";

        if (!isGoogleSSO) {
          pHash = crypto.createHash("sha256").update(password).digest("hex");
          sRef = await storeSecret(password);
          const scored = scorePassword(password);
          score = scored.score;
          label = scored.label;

          const reusedAccount = await prisma.account.findFirst({ where: { passwordHash: pHash } });
          if (reusedAccount) {
            notifyAdmins(
              "Password Reuse Detected",
              `The password for "${name}" (bulk import) is identical to an existing account ("${reusedAccount.name}").`,
              "PASSWORD_WEAK",
            );
          }
        }

        const account = await prisma.account.create({
          data: {
            name,
            username,
            platformType: platformType as any,
            secretRef: sRef,
            ownerId: req.user!.id,
            healthScore: score,
            healthLabel: label as any,
            refreshCycle: refreshCycle as any,
            notes,
            passwordHash: pHash,
            isGoogleSSO,
            qaStatus: "APPROVED",
            collectionId,
            createdBy: req.user!.id,
          },
        });

        const cycleDurations: Record<string, number> = {
          MONTHLY: 30,
          FOUR_MONTHS: 120,
          SIX_MONTHS: 180,
          ANNUALLY: 365,
          MANUAL: 365 * 10,
        };
        const daysUntilDue = cycleDurations[refreshCycle] || 120;
        await prisma.rotationSchedule.create({
          data: {
            accountId: account.id,
            cycle: refreshCycle as any,
            nextDue: new Date(Date.now() + daysUntilDue * 24 * 60 * 60 * 1000),
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            accountId: account.id,
            action: "ACCOUNT_CREATED",
            metadata: { source: "bulk_import", row: rowNum },
            ipAddress: req.ip,
          },
        });

        if (!isGoogleSSO && score < 40) {
          notifyUser(
            req.user!.id,
            "Weak Password Alert",
            `The password for "${name}" (bulk import) scored ${score}/100. Consider using a stronger password.`,
            "PASSWORD_WEAK",
          );
        }

        results.push({ row: rowNum, name, status: "created", id: account.id, qrPending });
      } catch (error) {
        console.error("[Bulk Import Row]", error);
        fail("Failed to create account.");
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "error").length;
    const qrPendingCount = results.filter((r) => r.status === "created" && r.qrPending).length;

    if (created > 0) {
      notifyAdmins(
        "Bulk Import Completed",
        `${req.user!.name} bulk-imported ${created} vault ${created === 1 ? "entry" : "entries"}${failed ? ` (${failed} row${failed === 1 ? "" : "s"} failed)` : ""}${qrPendingCount ? `; ${qrPendingCount} Google Workspace ${qrPendingCount === 1 ? "entry needs" : "entries need"} a QR code added.` : "."}`,
        "NEW_ENTRY_QA",
      );
    }

    // Always 2xx here: the request itself was well-formed and fully
    // processed, even if every row failed validation — that's row-level
    // feedback for the client to render, not an HTTP-level client error
    // (which would make axios reject and drop `results` in the catch
    // branch before the UI ever sees the per-row reasons).
    res.status(created > 0 ? 201 : 200).json({ created, failed, results });
  },
);

// PATCH /api/accounts/bulk-qr — attach TOTP QR codes to multiple accounts
// in one request [ADMIN]. Companion to bulk-import: rows imported as
// GOOGLE_WORKSPACE without a QR get flagged with the QR_PENDING_NOTE_PREFIX
// note; this is how an admin clears that backlog without opening
// EditEntryModal once per account. Same base64-data-URI-in-JSON shape
// EditEntryModal already uses for a single QR upload — no multipart here.
router.patch(
  "/bulk-qr",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const updates = req.body.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ error: "updates array is required." });
      return;
    }
    if (updates.length > MAX_IMPORT_ROWS) {
      res.status(400).json({ error: `Cannot update more than ${MAX_IMPORT_ROWS} accounts at once.` });
      return;
    }

    const results: Array<{ accountId: string; status: "updated" | "error"; error?: string }> = [];

    for (const u of updates) {
      const accountId = u?.accountId;
      const totpQrBase64 = u?.totpQrBase64;

      if (!accountId || !totpQrBase64) {
        results.push({
          accountId: accountId || "(missing)",
          status: "error",
          error: "accountId and totpQrBase64 are required.",
        });
        continue;
      }

      try {
        const account = await prisma.account.findUnique({ where: { id: accountId } });
        if (!account) {
          results.push({ accountId, status: "error", error: "Account not found." });
          continue;
        }

        try {
          await validateTotpQrImage(totpQrBase64);
        } catch (e: any) {
          results.push({ accountId, status: "error", error: e.message || "Could not read a valid authenticator QR code from that image." });
          continue;
        }

        let notes = account.notes;
        if (notes && notes.startsWith(QR_PENDING_NOTE_PREFIX)) {
          notes = notes.slice(QR_PENDING_NOTE_PREFIX.length).replace(/^\n/, "") || null;
        }

        await prisma.account.update({
          where: { id: accountId },
          data: { totpQrBase64, notes },
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            accountId,
            action: "ACCOUNT_UPDATED",
            metadata: { source: "bulk_qr_upload" },
            ipAddress: req.ip,
          },
        });

        results.push({ accountId, status: "updated" });
      } catch (error) {
        console.error("[Bulk QR Upload]", error);
        results.push({ accountId, status: "error", error: "Failed to update account." });
      }
    }

    const updated = results.filter((r) => r.status === "updated").length;
    const failed = results.length - updated;
    res.status(200).json({ updated, failed, results });
  },
);

// PATCH /api/accounts/:id/qa — approve/reject QA [ADMIN]
// BUG 10 DEFENSE: auto-create RotationSchedule on approval
router.patch(
  "/:id/qa",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { qaStatus } = req.body;
    if (!["APPROVED", "REJECTED"].includes(qaStatus)) {
      res.status(400).json({ error: "qaStatus must be APPROVED or REJECTED." });
      return;
    }
    try {
      const account = await prisma.account.findUnique({
        where: { id: asString(req.params.id) },
      });
      if (!account || account.qaStatus !== "PENDING") {
        res.status(400).json({ error: "Account is not in PENDING QA status." });
        return;
      }

      if (qaStatus === "APPROVED") {
        // BUG 10: Auto-create rotation schedule
        const cycleDurations: Record<string, number> = {
          MONTHLY: 30,
          FOUR_MONTHS: 120,
          SIX_MONTHS: 180,
          ANNUALLY: 365,
          MANUAL: 365 * 10,
        };
        const daysUntilDue = cycleDurations[account.refreshCycle] || 120;
        const nextDue = new Date(
          Date.now() + daysUntilDue * 24 * 60 * 60 * 1000,
        );

        await prisma.$transaction([
          prisma.account.update({
            where: { id: asString(req.params.id) },
            data: { qaStatus: "APPROVED" },
          }),
          prisma.rotationSchedule.create({
            data: {
              accountId: asString(req.params.id)!,
              cycle: account.refreshCycle,
              nextDue,
            },
          }),
        ]);
      } else {
        await prisma.account.update({
          where: { id: asString(req.params.id) },
          data: { qaStatus: "REJECTED" },
        });
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: asString(req.params.id),
          action: `QA_${qaStatus}`,
          ipAddress: req.ip,
        },
      });
      res.json({ message: `Account ${qaStatus.toLowerCase()}.` });
    } catch (error) {
      console.error("[QA]", error);
      res.status(500).json({ error: "QA action failed." });
    }
  },
);

// POST /api/accounts/:id/reveal — fetch password from Secret Manager [USER with grant]
router.post(
  "/:id/reveal",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accountId = asString(req.params.id);
    const userId = req.user!.id;

    let validatedGrant: any = null;

    try {
      // USER requires an active AccessGrant (checked here); MANAGER is
      // scoped to their assigned collections (checked once the account is
      // loaded, below); ADMIN can reveal any account.
      if (req.user!.role === "USER") {
        // Check grant exists, is active, and not expired
        validatedGrant = await prisma.accessGrant.findFirst({
          where: {
            accountId,
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (!validatedGrant) {
          // Clean up any expired grants for this user+account so UI shows correctly
          await prisma.accessGrant.updateMany({
            where: { accountId, userId, active: true, expiresAt: { lte: new Date() } },
            data: { active: false },
          });
          res.status(403).json({
            error: "Your access has expired. Please request access again.",
          });
          return;
        }
      }


      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      if (
        req.user!.role === "MANAGER" &&
        !isAccountInManagerScope(req.user, account.collectionId)
      ) {
        res.status(403).json({
          error: "This account is outside your assigned collections.",
        });
        return;
      }

      if (
        req.user!.role !== "ADMIN" &&
        !meetsClearance(req.user!.clearanceLevel, account.requiredClearance)
      ) {
        res.status(403).json({
          error: "Your clearance level is insufficient for this account.",
        });
        return;
      }

      // Write audit BEFORE returning secret
      await prisma.auditLog.create({
        data: {
          userId,
          accountId,
          action: "PASSWORD_REVEALED",
          ipAddress: req.ip,
        },
      });

      const password = account.isGoogleSSO
        ? "USE_GOOGLE_SSO" 
        : await fetchSecret(account.secretRef);

      let expiresIn: number | null = null;
      let grantExpiresAt: Date | null = null;

      // If USER, check for VIEW_90S or TEMP_24H grant to shrink
      if (req.user!.role === "USER" && validatedGrant) {
        let grant = validatedGrant;

        if (grant) {
          // First-ever view: replace the 24h "must view by" deadline (set at
          // approval, see services/accessRequests.ts) with the real access
          // window for this accessType. Keyed off firstRevealedAt, NOT
          // expiresAt === null, since expiresAt is already populated at
          // approval time now.
          if (!(grant as any).firstRevealedAt) {
            const accessType = (grant as any).accessType || "ONGOING";
            const newExpires =
              accessType === "VIEW_90S"
                ? new Date(Date.now() + 90 * 1000)
                : accessType === "TEMP_24H"
                ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                : null; // ONGOING — no expiry once actually viewed
            grant = await prisma.accessGrant.update({
              where: { id: grant.id },
              data: { expiresAt: newExpires, firstRevealedAt: new Date() },
            });
          }

          // Calculate remaining seconds
          if (grant.expiresAt) {
            const remaining = Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000));
            expiresIn = Math.min(90, remaining);
            grantExpiresAt = grant.expiresAt;
          }
        }
      }

      res.json({ password, expiresIn, grantExpiresAt });
    } catch (error: any) {
      console.error("[Reveal]", error);
      res.status(500).json({ error: error.message || "Failed to reveal password." });
    }
  },
);

// POST /api/accounts/:id/reveal-qr — view the raw authenticator QR image [ADMIN only]
// Everyone else gets the rotating code instead — see reveal-otp below. The
// underlying secret/QR is only ever handed out to admins re-provisioning a
// device.
router.post(
  "/:id/reveal-qr",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const accountId = asString(req.params.id);

    try {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      if (!account.totpQrBase64) {
        res.status(404).json({ error: "No QR Code found for this account." });
        return;
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId,
          action: "QR_CODE_REVEALED",
          ipAddress: req.ip,
        },
      });

      res.json({ qrCodeBase64: account.totpQrBase64, expiresIn: null, grantExpiresAt: null });
    } catch (error: any) {
      console.error("[Reveal QR]", error);
      res.status(500).json({ error: error.message || "Failed to reveal QR Code." });
    }
  },
);

// POST /api/accounts/:id/reveal-otp — compute the current TOTP code [USER with grant]
// Decodes the stored QR image server-side and returns only the rotating
// 6-digit code — never the QR image or the secret it encodes.
router.post(
  "/:id/reveal-otp",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const accountId = asString(req.params.id);
    const userId = req.user!.id;

    let validatedGrant: any = null;

    try {
      if (req.user!.role === "USER") {
        validatedGrant = await prisma.accessGrant.findFirst({
          where: {
            accountId,
            userId,
            active: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });
        if (!validatedGrant) {
          // Clean up any expired grants for this user+account so UI shows correctly
          await prisma.accessGrant.updateMany({
            where: { accountId, userId, active: true, expiresAt: { lte: new Date() } },
            data: { active: false },
          });
          res.status(403).json({
            error: "Your access has expired. Please request access again.",
          });
          return;
        }
      }

      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      if (
        req.user!.role === "MANAGER" &&
        !isAccountInManagerScope(req.user, account.collectionId)
      ) {
        res.status(403).json({
          error: "This account is outside your assigned collections.",
        });
        return;
      }

      if (!account.totpQrBase64) {
        res.status(404).json({ error: "No authenticator QR code found for this account." });
        return;
      }

      if (
        req.user!.role !== "ADMIN" &&
        !meetsClearance(req.user!.clearanceLevel, account.requiredClearance)
      ) {
        res.status(403).json({
          error: "Your clearance level is insufficient for this account.",
        });
        return;
      }

      let otp: string;
      let secondsRemaining: number;
      try {
        ({ otp, secondsRemaining } = await generateOtpFromQrImage(account.totpQrBase64));
      } catch (e: any) {
        console.error("[Reveal OTP] Failed to decode stored QR image", e);
        res.status(500).json({ error: "Could not generate an OTP from the stored QR code." });
        return;
      }

      // Write audit BEFORE returning the code — but only the first reveal
      // in a short window. While an OTP pill is on screen the client
      // silently re-fetches a fresh code at every ~30s TOTP rotation (see
      // RevealOtp.jsx), and each of those hits this route; without this
      // guard an open pill spams one identical audit row per rotation. A
      // genuine re-reveal after the window has passed still logs.
      const OTP_AUDIT_DEDUPE_MS = 5 * 60 * 1000;
      const recentReveal = await prisma.auditLog.findFirst({
        where: {
          userId,
          accountId,
          action: "OTP_REVEALED",
          timestamp: { gt: new Date(Date.now() - OTP_AUDIT_DEDUPE_MS) },
        },
        select: { id: true },
      });
      if (!recentReveal) {
        await prisma.auditLog.create({
          data: {
            userId,
            accountId,
            action: "OTP_REVEALED",
            ipAddress: req.ip,
          },
        });
      }

      let expiresIn: number | null = null;
      let grantExpiresAt: Date | null = null;

      // If USER, check for VIEW_90S or TEMP_24H grant to shrink
      if (req.user!.role === "USER" && validatedGrant) {
        let grant = validatedGrant;

        if (grant) {
          // First-ever view: replace the 24h "must view by" deadline (set at
          // approval, see services/accessRequests.ts) with the real access
          // window for this accessType. Keyed off firstRevealedAt, NOT
          // expiresAt === null, since expiresAt is already populated at
          // approval time now.
          if (!(grant as any).firstRevealedAt) {
            const accessType = (grant as any).accessType || "ONGOING";
            const newExpires =
              accessType === "VIEW_90S"
                ? new Date(Date.now() + 90 * 1000)
                : accessType === "TEMP_24H"
                ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                : null; // ONGOING — no expiry once actually viewed
            grant = await prisma.accessGrant.update({
              where: { id: grant.id },
              data: { expiresAt: newExpires, firstRevealedAt: new Date() },
            });
          }

          // Calculate remaining seconds
          if (grant.expiresAt) {
            const remaining = Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000));
            expiresIn = Math.min(90, remaining);
            grantExpiresAt = grant.expiresAt;
          }
        }
      }

      res.json({ otp, secondsRemaining, expiresIn, grantExpiresAt });
    } catch (error: any) {
      console.error("[Reveal OTP]", error);
      res.status(500).json({ error: error.message || "Failed to generate OTP." });
    }
  },
);

// POST /api/accounts/:id/force-rotate — force password rotation [ADMIN]
router.post(
  "/:id/force-rotate",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: asString(req.params.id) },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      const now = new Date();

      await prisma.rotationSchedule.upsert({
        where: { accountId: account.id },
        update: { nextDue: now },
        create: {
          accountId: account.id,
          cycle: account.refreshCycle,
          nextDue: now,
        },
      });

      notifyUser(
        account.ownerId,
        "Mandatory Password Rotation",
        `An admin has requested a mandatory password rotation for "${account.name}". Please update it immediately.`,
        "ROTATION_DUE"
      );

      res.json({ message: "Force rotation triggered successfully." });
    } catch (error) {
      console.error("[Force Rotate]", error);
      res.status(500).json({ error: "Failed to force rotation." });
    }
  }
);

// PATCH /api/accounts/:id — update account details [ADMIN]
router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, username, platformType, refreshCycle, password, notes, collectionId, totpQrBase64, isGoogleSSO, requiredClearance } = req.body;

    try {
      const account = await prisma.account.findUnique({
        where: { id: asString(req.params.id) },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      const resultingPlatformType = platformType || account.platformType;
      const resultingIsGoogleSSO = isGoogleSSO !== undefined ? isGoogleSSO : account.isGoogleSSO;
      const resultingHasQr = totpQrBase64 !== undefined ? !!totpQrBase64 : !!account.totpQrBase64;
      if (
        resultingPlatformType === "GOOGLE_WORKSPACE" &&
        !resultingIsGoogleSSO &&
        !resultingHasQr &&
        (await isTotpQrRequired())
      ) {
        res.status(400).json({ error: "An Authenticator QR Code is required for Google Workspace accounts." });
        return;
      }

      if (totpQrBase64) {
        try {
          await validateTotpQrImage(totpQrBase64);
        } catch (e: any) {
          res.status(400).json({ error: e.message || "Could not read a valid authenticator QR code from that image." });
          return;
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (username) updateData.username = username;
      if (platformType) updateData.platformType = platformType;
      if (refreshCycle) updateData.refreshCycle = refreshCycle;
      if (notes !== undefined) updateData.notes = notes;
      if (totpQrBase64 !== undefined) updateData.totpQrBase64 = totpQrBase64;
      if (collectionId !== undefined) updateData.collectionId = collectionId === "" ? null : collectionId;
      if (isGoogleSSO !== undefined) updateData.isGoogleSSO = isGoogleSSO;
      if (requiredClearance !== undefined) updateData.requiredClearance = requiredClearance || null;

      const isBecomingSSO = isGoogleSSO === true || (isGoogleSSO === undefined && account.isGoogleSSO);

      if (isBecomingSSO) {
        // If SSO, ensure we have the SSO secretRef, ignore password
        updateData.secretRef = "SSO_ONLY";
        updateData.healthScore = 100;
        updateData.healthLabel = "SSO";
        updateData.passwordHash = null;
        if (account.secretRef !== "SSO_ONLY") {
          deleteSecret(account.secretRef).catch(console.error); // Clean up old secret
        }
      } else if (password) {
        // Not SSO, and user provided a new password
        const { score, label } = scorePassword(password);
        const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

        const reusedAccount = await prisma.account.findFirst({
          where: { passwordHash, id: { not: account.id } }
        });
        if (reusedAccount) {
          notifyAdmins(
            "Password Reuse Detected",
            `The updated password for "${account.name}" is identical to an existing account ("${reusedAccount.name}").`,
            "PASSWORD_WEAK"
          );
        }

        const newSecretRef = account.secretRef === "SSO_ONLY" 
          ? await storeSecret(password)
          : await updateSecret(account.secretRef, password);
        
        updateData.secretRef = newSecretRef;
        updateData.passwordHash = passwordHash;
        updateData.healthScore = score;
        updateData.healthLabel = label as any;
        updateData.lastUpdatedAt = new Date();
        updateData.lastUpdatedBy = req.user!.id;
      }

      const updated = await prisma.account.update({
        where: { id: asString(req.params.id) },
        data: updateData,
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          accountId: updated.id,
          action: "ACCOUNT_UPDATED",
          ipAddress: req.ip,
        },
      });

      res.json({ ...updated, secretRef: undefined });
    } catch (error) {
      console.error("[Update Account]", error);
      res.status(500).json({ error: "Failed to update account." });
    }
  }
);

// DELETE /api/accounts/:id — delete an account [ADMIN]
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: asString(req.params.id) },
      });
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      await deleteSecret(account.secretRef);

      await prisma.account.delete({
        where: { id: asString(req.params.id) },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "ACCOUNT_DELETED",
          metadata: { deletedAccount: account.name },
          ipAddress: req.ip,
        },
      });

      res.json({ message: "Account deleted." });
    } catch (error) {
      console.error("[Delete Account]", error);
      res.status(500).json({ error: "Failed to delete account." });
    }
  }
);

// POST /api/accounts/bulk-delete — delete multiple accounts [ADMIN]
// Requires the caller to have already confirmed via the "type approve" UI flow;
// each deletion is written to the immutable AuditLog.
router.post(
  "/bulk-delete",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { accountIds } = req.body;
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      res.status(400).json({ error: "accountIds must be a non-empty array." });
      return;
    }
    try {
      const targets = await prisma.account.findMany({
        where: { id: { in: accountIds } },
      });

      await Promise.all(targets.map((a) => deleteSecret(a.secretRef)));

      await prisma.$transaction([
        prisma.account.deleteMany({ where: { id: { in: accountIds } } }),
        prisma.auditLog.createMany({
          data: targets.map((a) => ({
            userId: req.user!.id,
            action: "ACCOUNT_BULK_DELETED",
            metadata: { deletedAccount: a.name },
            ipAddress: req.ip,
          })),
        }),
      ]);

      res.json({ message: `${targets.length} account(s) deleted.` });
    } catch (error) {
      console.error("[Bulk Delete Accounts]", error);
      res.status(500).json({ error: "Failed to delete accounts." });
    }
  },
);

// POST /api/accounts/sync-workspace — creates a vault Account for every
// active Google Workspace user who doesn't already have one (matched by
// username/email, any platformType, case-insensitive). Create-only —
// never updates an existing entry. isGoogleSSO: true / secretRef:
// "SSO_ONLY" since these track access to each person's own Workspace
// login, not a shared password. See services/workspaceAccountSync.ts. [ADMIN]
router.post(
  "/sync-workspace",
  requireAuth,
  requireRole("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await syncWorkspaceAccountsToVault(req.user!.id);
      res.json(result);
    } catch (error) {
      console.error("[Sync Workspace Accounts]", error);
      res.status(500).json({ error: "Failed to sync Workspace accounts." });
    }
  },
);

export default router;
