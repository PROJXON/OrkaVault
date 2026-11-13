/**
 * In-app documentation (Phase 4d). Mounted at /api/docs.
 *
 * The REST API docs are ADMIN only and live here, in the backend, so they
 * never ship in the public frontend bundle (Firebase serves the JS to
 * anyone). The frontend's ProtectedRoute is UX only; this route is the gate.
 *
 * rest-api.md must never hold anything environment-specific or secret: no
 * keys, no hostnames, no env var names. The frontend inserts the base URL.
 */
import fs from "fs";
import path from "path";
import { Router, Response } from "express";
import { requireAuth, requireRole, AuthenticatedRequest } from "../middleware/auth";
import { noStore } from "../middleware/apiKey";
import { AUDIT_ACTIONS, AuditCategory } from "../config/auditActions";
import { EXTERNAL_API_ENABLED } from "../services/apiKeys";

const router = Router();

router.use(noStore);
router.use(requireAuth);

const API_VERSION = "v1";

function docsDir(): string {
  // ts-node runs from src/routes; the compiled app from dist/routes, which
  // tsc doesn't copy .md files into, so fall back to the source tree.
  const candidates = [path.join(__dirname, "../docs"), path.resolve(__dirname, "../../src/docs")];
  return candidates.find((d) => fs.existsSync(path.join(d, "rest-api.md"))) ?? candidates[0];
}

// Read once at startup. A missing file is a deploy problem, not a reason to
// crash the API, so the route answers 500 instead.
let restApiMarkdown: string | null = null;
try {
  restApiMarkdown = fs.readFileSync(path.join(docsDir(), "rest-api.md"), "utf8");
} catch (error: any) {
  console.error("[Docs] rest-api.md could not be read:", error?.message ?? error);
}

// Grouped once: the catalog is a compile-time constant.
const CATEGORY_ORDER: AuditCategory[] = [
  "Authentication",
  "Users",
  "Credentials",
  "Access",
  "Policies & content",
  "Organization settings",
  "API keys",
  "External API",
  "System",
];
const groupedActions = CATEGORY_ORDER.map((category) => ({
  category,
  actions: Object.entries(AUDIT_ACTIONS)
    .filter(([, info]) => info.category === category)
    .map(([action, info]) => ({
      action,
      description: info.description,
      metadata: "metadata" in info ? (info.metadata as Record<string, string>) : {},
    })),
})).filter((g) => g.actions.length > 0);

// GET /api/docs/rest-api — ADMIN only.
router.get("/rest-api", requireRole("ADMIN"), (_req: AuthenticatedRequest, res: Response) => {
  if (restApiMarkdown === null) {
    res.status(500).json({ error: "The REST API documentation is unavailable on this server." });
    return;
  }
  res.json({
    markdown: restApiMarkdown,
    actions: groupedActions,
    apiVersion: API_VERSION,
    externalApiEnabled: EXTERNAL_API_ENABLED,
  });
});

export default router;
