/**
 * API key management for the external audit API (Phase 4c §4a).
 * Mounted at /api/api-keys. ADMIN only, cookie session + CSRF (global).
 *
 * Deliberately not in routes/integrations.ts: that file holds
 * unauthenticated, signature-verified webhook paths, and mixing admin
 * endpoints into it invites a missing-guard mistake.
 *
 * The plaintext key appears in exactly two responses (create, regenerate),
 * once each. keyHash never leaves the server.
 */
import { Router, Response, NextFunction } from "express";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { noStore } from "../middleware/apiKey";
import { apiKeyStepUpLimiter } from "../middleware/rateLimit";
import { asString } from "../utils/reqValue";
import {
  ApiKeyError,
  KeyActor,
  createKey,
  listKeys,
  parseExpiry,
  parseName,
  regenerateKey,
  revokeKey,
  verifyStepUp,
} from "../services/apiKeys";

const router = Router();

router.use(noStore);
router.use(requireAuth);
router.use(requireRole("ADMIN"));

const actorOf = (req: AuthenticatedRequest): KeyActor => ({
  id: req.user!.id,
  email: req.user!.email,
  name: req.user!.name,
});

function sendError(res: Response, error: unknown, label: string) {
  if (error instanceof ApiKeyError) {
    res.status(error.status).json({ error: error.message, ...(error.code && { code: error.code }) });
    return;
  }
  console.error(`[API Keys] ${label} failed:`, error);
  res.status(500).json({ error: "Something went wrong managing API keys." });
}

// Body validation runs before the step-up, so a typo in the name doesn't
// burn an authenticator code or a rate-limit slot.
function validateCreate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    res.locals.name = parseName(req.body?.name);
    res.locals.days = parseExpiry(req.body?.expiresInDays);
    next();
  } catch (error) {
    sendError(res, error, "validate");
  }
}

function validateRegenerate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const raw = req.body?.expiresInDays;
    res.locals.days = raw === undefined ? undefined : parseExpiry(raw);
    next();
  } catch (error) {
    sendError(res, error, "validate");
  }
}

// GET /api/api-keys[?include=all]
router.get("/", async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await listKeys(asString(req.query.include as string | undefined) === "all"));
  } catch (error) {
    sendError(res, error, "list");
  }
});

// POST /api/api-keys  { name, expiresInDays: 30|90|365|null, mfaCode }
router.post("/", validateCreate, apiKeyStepUpLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = actorOf(req);
    await verifyStepUp(actor, req.body?.mfaCode, req);
    res.status(201).json(await createKey(actor, res.locals.name, res.locals.days, req));
  } catch (error) {
    sendError(res, error, "create");
  }
});

// POST /api/api-keys/:id/regenerate  { mfaCode, expiresInDays? }
router.post(
  "/:id/regenerate",
  validateRegenerate,
  apiKeyStepUpLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = actorOf(req);
      await verifyStepUp(actor, req.body?.mfaCode, req);
      res.status(201).json(await regenerateKey(actor, asString(req.params.id)!, res.locals.days, req));
    } catch (error) {
      sendError(res, error, "regenerate");
    }
  },
);

// DELETE /api/api-keys/:id — revoke. No step-up: incident response must be fast.
router.delete("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await revokeKey(actorOf(req), asString(req.params.id)!, req));
  } catch (error) {
    sendError(res, error, "revoke");
  }
});

export default router;
