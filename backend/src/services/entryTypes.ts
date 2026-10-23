/**
 * Vault entry types (Account.entryType).
 *
 * One rules row per type so the routes ask "does this type do X?" instead
 * of comparing against SECURE_NOTE everywhere. Adding a type later is an
 * enum value in schema.prisma plus a row here (and frontend/src/lib/entryTypes.js).
 */
import { EntryType } from "../generated/prisma/client";

export interface EntryTypeRules {
  /** username is required (otherwise stored as ""). */
  requiresUsername: boolean;
  /** secret is scored with scorePassword() and checked for reuse. */
  scoresHealth: boolean;
  /** gets a RotationSchedule / can be force-rotated. */
  rotates: boolean;
  allowsTotpQr: boolean;
  allowsSso: boolean;
  /** max secret length in characters, null = no cap. */
  maxSecretLength: number | null;
}

export const ENTRY_TYPE_RULES: Record<EntryType, EntryTypeRules> = {
  LOGIN: {
    requiresUsername: true,
    scoresHealth: true,
    rotates: true,
    allowsTotpQr: true,
    allowsSso: true,
    maxSecretLength: null,
  },
  SECURE_NOTE: {
    requiresUsername: false,
    scoresHealth: false,
    rotates: false,
    allowsTotpQr: false,
    allowsSso: false,
    maxSecretLength: 10_000,
  },
};

export const ENTRY_TYPES = Object.keys(ENTRY_TYPE_RULES) as EntryType[];

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === "string" && (ENTRY_TYPES as string[]).includes(value);
}

export function entryTypeRules(type: EntryType | null | undefined): EntryTypeRules {
  return ENTRY_TYPE_RULES[type || "LOGIN"];
}
