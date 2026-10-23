// Admin-editable content keys (Phase 4b). Mirrors
// backend/src/config/contentRegistry.ts: keys and render hints only. The
// text itself comes from GET /content/current (lib/content.jsx).
//
// `fallback` is shown only when the API is unreachable, so the sign-in
// notice, consent bar and gate still say something. Keep it short; the
// published text in Settings → Content is the real source.
//
// Adding an editable banner = a row here + a row in the backend registry +
// a backend seed file + rendering it with useContent(key).

export const LEGACY_V1_VERSION = "2026-10-23";

export const CONTENT_REGISTRY = {
  TERMS: { kind: "policy", acceptance: "terms", page: "terms" },
  PRIVACY: { kind: "policy", acceptance: "privacy", page: "privacy" },
  NOTICE: {
    kind: "policy",
    acceptance: "notice",
    page: "notice",
    // AC-8: the gate must show the notice even if the content API fails.
    fallback:
      "**OrkaVault is a private PROJXON system for authorized users only.** Your use of this system is monitored, recorded, and subject to audit. Unauthorized access or use is prohibited. Using this system means you consent to this monitoring and recording. Details are in the [Terms of Use](/legal/terms#monitoring) and the [Privacy notice](/legal/privacy).",
  },
  COOKIES: { kind: "policy", acceptance: "consent", page: "cookies" },
  NOTICE_BANNER: {
    kind: "banner",
    fallback:
      "**Authorized PROJXON users only.** This is a private PROJXON system. Activity is monitored, recorded, and subject to audit. Unauthorized access or use is prohibited. By signing in you consent to this monitoring.",
  },
  CONSENT_BANNER: {
    kind: "banner",
    fallback:
      "**Your privacy choices**\n\nOrkaVault only uses storage that is strictly necessary to sign you in and keep your session secure. Signing in with Google is optional: it loads Google's sign-in service (accounts.google.com), which may set its own cookies. Nothing from Google loads unless you allow it.",
  },
  REGISTER_TERMS_LABEL: {
    kind: "banner",
    fallback: "I have read and accept the [Terms of Use](/legal/terms) and the [Privacy notice](/legal/privacy).",
  },
  POLICY_UPDATED_BANNER: {
    kind: "banner",
    fallback: "**Please review before continuing.** Read each policy below, tick its box, and accept to continue.",
  },
  LEGAL_DRAFT_BANNER: {
    kind: "banner",
    fallback: "**DRAFT, pending legal review.** This text may change. Items marked [TBD] are still open.",
  },
};

/** /legal/:page → policy key. */
export const LEGAL_PAGES = { terms: "TERMS", privacy: "PRIVACY", cookies: "COOKIES", notice: "NOTICE" };

export function legalPath(key) {
  const page = CONTENT_REGISTRY[key]?.page;
  return page ? `/legal/${page}` : null;
}

/** Label of a policy's primary "publish" button. */
export function reacceptLabel(acceptance) {
  if (acceptance === "notice") return "Publish & require re-acknowledgment";
  if (acceptance === "consent") return "Publish & re-ask cookie consent";
  return "Publish & require re-acceptance";
}
