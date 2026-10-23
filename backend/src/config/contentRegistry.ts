/**
 * Admin-editable content registry (Phase 4b). Every policy page and every
 * banner of legal/notice text users see is a key here; its text lives in
 * ContentVersion rows, edited in Settings → Content.
 *
 * Mirrored (keys + render hints, banner fallbacks) in
 * frontend/src/lib/contentRegistry.js. Adding an editable banner = a row
 * here + one there + a seed file in content-seed/ + rendering it with
 * useContent(key). No schema change.
 */

export type ContentKind = "policy" | "banner";
// What accepting a policy means. terms/privacy/notice are enforced by the
// server-side gate; consent only re-shows the cookie bar (client-side).
export type AcceptanceKind = "terms" | "privacy" | "notice" | "consent" | null;

export interface ContentRegistryEntry {
  key: string;
  kind: ContentKind;
  acceptance: AcceptanceKind;
  label: string; // admin list name
  defaultTitle: string | null; // seeded v1 title (policies only)
  maxLength: number;
  // Heading ids other screens link to (e.g. /legal/terms#monitoring). A
  // publish that removes one is rejected.
  requiredAnchors: string[];
}

const POLICY_MAX = 100 * 1024;
const BANNER_MAX = 1000;

export const CONTENT_REGISTRY: ContentRegistryEntry[] = [
  { key: "TERMS", kind: "policy", acceptance: "terms", label: "Terms of Use", defaultTitle: "Terms of Use", maxLength: POLICY_MAX, requiredAnchors: ["monitoring"] },
  { key: "PRIVACY", kind: "policy", acceptance: "privacy", label: "Privacy notice", defaultTitle: "Privacy notice", maxLength: POLICY_MAX, requiredAnchors: ["personal-vault"] },
  { key: "NOTICE", kind: "policy", acceptance: "notice", label: "System Use Notice", defaultTitle: "System Use Notice", maxLength: POLICY_MAX, requiredAnchors: [] },
  { key: "COOKIES", kind: "policy", acceptance: "consent", label: "Cookie and storage notice", defaultTitle: "Cookie and storage notice", maxLength: POLICY_MAX, requiredAnchors: [] },
  { key: "NOTICE_BANNER", kind: "banner", acceptance: null, label: "Sign-in notice banner (Login, Register)", defaultTitle: null, maxLength: BANNER_MAX, requiredAnchors: [] },
  { key: "CONSENT_BANNER", kind: "banner", acceptance: null, label: "Cookie consent bar text", defaultTitle: null, maxLength: BANNER_MAX, requiredAnchors: [] },
  { key: "REGISTER_TERMS_LABEL", kind: "banner", acceptance: null, label: "Register: Terms checkbox label", defaultTitle: null, maxLength: BANNER_MAX, requiredAnchors: [] },
  { key: "POLICY_UPDATED_BANNER", kind: "banner", acceptance: null, label: "Policy update alert: heading and intro", defaultTitle: null, maxLength: BANNER_MAX, requiredAnchors: [] },
  { key: "LEGAL_DRAFT_BANNER", kind: "banner", acceptance: null, label: "\"DRAFT, pending legal review\" box", defaultTitle: null, maxLength: BANNER_MAX, requiredAnchors: [] },
];

const BY_KEY = new Map(CONTENT_REGISTRY.map((e) => [e.key, e]));

export function registryEntry(key: string): ContentRegistryEntry | undefined {
  return BY_KEY.get(key);
}

/** Policies the server-side gate requires (terms, privacy, notice). */
export const GATED_KEYS = CONTENT_REGISTRY.filter(
  (e) => e.acceptance === "terms" || e.acceptance === "privacy" || e.acceptance === "notice",
).map((e) => e.key);

/** Version label of the seeded v1, kept from Phase 4 so nobody is re-prompted. */
export const LEGACY_V1_VERSION = "2026-10-23";
