// Version + effective date of each legal document (NEW-FEAT §1.2).
//
// KEEP IN SYNC with backend/src/config/legalVersions.ts: the backend
// decides which TERMS / NOTICE version a user must have accepted (Phase 4),
// this file decides which text is shown. Bumping a version forces
// re-acceptance on next sign-in, so bump both apps together.
//
// `draft: true` shows the "DRAFT, pending legal review" banner on the page.
// Clear it only once PROJXON leadership/counsel has signed off (§14.11).

export const TERMS = {
  version: "2026-10-23",
  effectiveDate: "2026-10-23",
  draft: true,
};

export const PRIVACY = {
  version: "2026-10-23",
  effectiveDate: "2026-10-23",
  draft: true,
};

export const COOKIES = {
  version: "2026-10-23",
  effectiveDate: "2026-10-23",
  draft: true,
};

// System Use Notice (pre-auth banner + post-auth acknowledgment gate, Phase 4).
export const NOTICE = {
  version: "2026-10-23",
  effectiveDate: "2026-10-23",
  draft: true,
};

// Contact for questions, export and deletion requests. Placeholder until
// PROJXON names the owning team/mailbox.
export const LEGAL_CONTACT = "[TBD: PROJXON contact address]";
