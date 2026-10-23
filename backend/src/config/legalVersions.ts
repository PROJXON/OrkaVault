/**
 * Required versions of the legal documents a user must accept (NEW-FEAT §1.2).
 * Phase 4 compares these against the versions a user last accepted and
 * re-prompts on a mismatch.
 *
 * KEEP IN SYNC with frontend/src/lib/legalVersions.js: the frontend shows
 * the document text for its `version`, the backend requires this one. Bump
 * both together (or set the env vars to the new frontend version on deploy).
 */
const DEFAULT_TERMS_VERSION = "2026-10-23";
const DEFAULT_NOTICE_VERSION = "2026-10-23";

export const REQUIRED_TERMS_VERSION = process.env.LEGAL_TERMS_VERSION?.trim() || DEFAULT_TERMS_VERSION;
export const REQUIRED_NOTICE_VERSION = process.env.LEGAL_NOTICE_VERSION?.trim() || DEFAULT_NOTICE_VERSION;
