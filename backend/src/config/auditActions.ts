/**
 * Audit action catalog (Phase 4c, shaped for Phase 4d §1a).
 *
 * The single source of truth for every AuditLog.action string. Writes go
 * through services/audit.ts, whose `action` parameter is typed as
 * AuditAction, so an uncatalogued or misspelled action fails `tsc`.
 * Phase 4d's REST API docs page serves this catalog.
 *
 * Existing action strings must never be renamed: Audit.jsx,
 * AccessHistoryModal and OrkaSecurity filter on them.
 *
 * `metadata` describes the keys a row may carry. It documents field NAMES
 * only. Never put secrets, password/OTP values, tokens, custom-field values
 * or key material into audit metadata.
 */

export type AuditCategory =
  | "Authentication"
  | "Users"
  | "Credentials"
  | "Access"
  | "Policies & content"
  | "Organization settings"
  | "API keys"
  | "External API"
  | "System";

interface AuditActionInfo {
  category: AuditCategory;
  description: string;
  metadata?: Record<string, string>;
}

export const AUDIT_ACTIONS = {
  // ─── Authentication ────────────────────────────────────────────────────
  LOGIN_SUCCESS: {
    category: "Authentication",
    description: "A user signed in.",
    metadata: { method: "password | google | mfa_totp | mfa_device" },
  },
  LOGIN_FAILED: {
    category: "Authentication",
    description: "A sign-in attempt failed. userId is set when the account is known.",
    metadata: {
      method: "password | google | mfa_totp | mfa_device",
      reason:
        "UNKNOWN_EMAIL | NO_PASSWORD | BAD_PASSWORD | INACTIVE | BAD_GOOGLE_TOKEN | BAD_TEMP_TOKEN | DEVICE_NOT_REGISTERED | DEVICE_SIG_FAILED | BAD_CODE",
      attemptedEmail: "only when the account is unknown (trimmed, max 254 chars)",
    },
  },
  ADMIN_SETUP_FAILED: {
    category: "Authentication",
    description: "Registration with an invalid first-admin setup token.",
    metadata: { attemptedEmail: "the email the request tried to register" },
  },
  MFA_ENABLED: { category: "Authentication", description: "A user turned on two-factor authentication." },
  MFA_DISABLED: { category: "Authentication", description: "A user turned off two-factor authentication." },
  MFA_DISABLE_FAILED: {
    category: "Authentication",
    description: "An attempt to turn off two-factor authentication used a wrong code.",
  },
  MFA_DEVICE_REMOVED: {
    category: "Authentication",
    description: "A user removed a registered MFA device.",
    metadata: { deviceId: "the removed device's id" },
  },
  PASSWORD_CHANGED: { category: "Authentication", description: "A user changed their own sign-in password." },
  PASSWORD_CHANGE_FAILED: {
    category: "Authentication",
    description: "A password change was rejected because the current password was wrong.",
  },

  // ─── Users ─────────────────────────────────────────────────────────────
  USER_REGISTERED: {
    category: "Users",
    description: "A new user registered.",
    metadata: { pending: "true when the account waits for admin approval" },
  },
  USER_APPROVED: {
    category: "Users",
    description: "An admin approved a pending registration.",
    metadata: { targetUserId: "", targetEmail: "" },
  },
  USER_DECLINED: {
    category: "Users",
    description: "An admin declined a pending registration.",
    metadata: { targetUserId: "", targetEmail: "" },
  },
  USER_ROLE_CHANGED: {
    category: "Users",
    description: "A user's role was changed.",
    metadata: { targetUserId: "", targetEmail: "", from: "previous role", to: "new role" },
  },
  USER_END_DATE_CHANGED: {
    category: "Users",
    description: "A user's offboarding end date was changed.",
    metadata: { targetUserId: "", from: "previous end date or null", to: "new end date or null" },
  },
  USER_DEACTIVATED: {
    category: "Users",
    description: "A user was deactivated and their grants revoked.",
    metadata: { targetUserId: "", targetEmail: "", grantsRevoked: "number of grants revoked" },
  },
  USER_BULK_DEACTIVATED: {
    category: "Users",
    description: "A user was deactivated as part of a bulk action.",
  },
  USER_PROFILE_UPDATED: {
    category: "Users",
    description: "An admin edited another user's profile.",
    metadata: { targetUserId: "", fields: "names of the changed fields only" },
  },
  USER_GAP_EXTENDED: {
    category: "Users",
    description: "A user's access gap period was extended.",
  },
  DISCORD_LINKED: {
    category: "Users",
    description: "A user linked their Discord account.",
    metadata: { discordUserId: "" },
  },

  // ─── Credentials ───────────────────────────────────────────────────────
  ACCOUNT_CREATED: { category: "Credentials", description: "A credential was created." },
  ACCOUNT_SUBMITTED: { category: "Credentials", description: "A credential was submitted for QA review." },
  ACCOUNT_UPDATED: { category: "Credentials", description: "A credential was edited." },
  QA_APPROVED: { category: "Credentials", description: "A submitted credential passed QA review." },
  QA_REJECTED: { category: "Credentials", description: "A submitted credential was rejected in QA review." },
  ACCOUNT_DELETED: { category: "Credentials", description: "A credential was deleted." },
  ACCOUNT_BULK_DELETED: { category: "Credentials", description: "A credential was deleted in a bulk action." },
  WORKSPACE_ACCOUNT_AUTO_CREATED: {
    category: "Credentials",
    description: "A credential was created automatically from Google Workspace.",
  },
  PASSWORD_REVEALED: { category: "Credentials", description: "A password was revealed." },
  QR_CODE_REVEALED: { category: "Credentials", description: "A TOTP QR code was revealed." },
  OTP_REVEALED: { category: "Credentials", description: "A one-time code was revealed." },

  // ─── Access ────────────────────────────────────────────────────────────
  ACCESS_REQUESTED: { category: "Access", description: "A user requested access to a credential." },
  ACCESS_APPROVED: { category: "Access", description: "An access request was approved." },
  ACCESS_DENIED: { category: "Access", description: "An access request was denied." },
  GRANT_UPDATED: {
    category: "Access",
    description: "An access grant's type was changed.",
    metadata: { accessType: "VIEW_90S | TEMP_24H | ONGOING" },
  },
  GRANT_REVOKED: { category: "Access", description: "An access grant was revoked." },

  // ─── Policies & content ────────────────────────────────────────────────
  CONTENT_PUBLISHED: { category: "Policies & content", description: "A policy or banner version was published." },
  CONTENT_ACCEPTED: { category: "Policies & content", description: "A user accepted a policy version." },

  // ─── Organization settings ─────────────────────────────────────────────
  ORG_POLICY_CHANGED: {
    category: "Organization settings",
    description: "An organization setting was created, changed or deleted (includes audit log retention).",
    metadata: { key: "setting name", from: "previous value", to: "new value" },
  },
  COLLECTION_CREATED: { category: "Organization settings", description: "A collection was created.", metadata: { collectionId: "", name: "" } },
  COLLECTION_UPDATED: { category: "Organization settings", description: "A collection was edited.", metadata: { collectionId: "", name: "" } },
  COLLECTION_DELETED: { category: "Organization settings", description: "A collection was deleted.", metadata: { collectionId: "", name: "" } },
  DEPARTMENT_CREATED: { category: "Organization settings", description: "A department was created.", metadata: { departmentId: "", name: "" } },
  DEPARTMENT_UPDATED: { category: "Organization settings", description: "A department was edited.", metadata: { departmentId: "", name: "" } },
  DEPARTMENT_DELETED: { category: "Organization settings", description: "A department was deleted.", metadata: { departmentId: "", name: "" } },

  // ─── API keys ──────────────────────────────────────────────────────────
  API_KEY_CREATED: {
    category: "API keys",
    description: "An admin created an external API key.",
    metadata: { apiKeyId: "", name: "", last4: "", scopes: "", expiresAt: "ISO date or null" },
  },
  API_KEY_REGENERATED: {
    category: "API keys",
    description: "An admin regenerated an external API key (the old key is revoked).",
    metadata: { oldApiKeyId: "", newApiKeyId: "", name: "", last4: "", expiresAt: "ISO date or null" },
  },
  API_KEY_REVOKED: {
    category: "API keys",
    description: "An admin revoked an external API key.",
    metadata: { apiKeyId: "", name: "", last4: "" },
  },
  API_KEY_STEPUP_FAILED: {
    category: "API keys",
    description: "Creating or regenerating an API key failed the authenticator-code check.",
    metadata: { reason: "BAD_CODE | REPLAY | MFA_NOT_ENABLED" },
  },

  // ─── External API ──────────────────────────────────────────────────────
  EXTERNAL_API_AUTH_FAILED: {
    category: "External API",
    description: "A request to the external audit API was rejected (capped at 100 rows per hour).",
    metadata: {
      reason: "MISSING | MALFORMED | INVALID | REVOKED | EXPIRED | SCOPE",
      apiKeyId: "when the key exists",
      apiKeyName: "when the key exists",
    },
  },

  // ─── System ────────────────────────────────────────────────────────────
  AUDIT_BACKUP_RUN: {
    category: "System",
    description: "The audit log retention backup ran.",
    metadata: { backedUp: "rows moved to CSV", deletedBackups: "old CSV files removed", trigger: "manual | cron" },
  },
} as const satisfies Record<string, AuditActionInfo>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
