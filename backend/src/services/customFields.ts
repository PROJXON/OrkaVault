/**
 * Custom fields on vault entries (Account).
 *
 * Labels are metadata and live in AccountCustomField rows. Values are
 * treated exactly like the password: one JSON blob {fieldId: value} per
 * account, stored via secretManager (never plaintext in Postgres), with
 * its ref on Account.customFieldsSecretRef. One blob instead of a ref per
 * field so a reveal is one fetch and an edit is one secret version.
 *
 * Values only ever leave the server through POST /api/accounts/:id/reveal,
 * so they inherit its grant / manager-scope / clearance / audit checks.
 */
import crypto from "crypto";
import { prisma } from "../lib/prismaClient";
import { storeSecret, fetchSecret, updateSecret, deleteSecret } from "./secretManager";

export const MAX_CUSTOM_FIELDS = 20;
export const MAX_LABEL_LENGTH = 64;
export const MAX_VALUE_LENGTH = 4096;

/** A validated field from a create/update body. value === null means
 *  "keep the stored value" (only valid for an existing field id on update). */
export interface CustomFieldInput {
  id: string | null;
  label: string;
  value: string | null;
}

export interface CustomFieldValue {
  id: string;
  label: string;
  value: string;
}

export class CustomFieldError extends Error {}

/** Validates the `customFields` request body shape. Throws CustomFieldError. */
export function validateCustomFields(input: unknown): CustomFieldInput[] {
  if (!Array.isArray(input)) {
    throw new CustomFieldError("customFields must be an array.");
  }
  if (input.length > MAX_CUSTOM_FIELDS) {
    throw new CustomFieldError(`An entry can have at most ${MAX_CUSTOM_FIELDS} custom fields.`);
  }
  const seenLabels = new Set<string>();
  return input.map((raw: any, i) => {
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    if (!label) {
      throw new CustomFieldError(`Custom field ${i + 1} needs a label.`);
    }
    if (label.length > MAX_LABEL_LENGTH) {
      throw new CustomFieldError(`Custom field labels must be ${MAX_LABEL_LENGTH} characters or fewer.`);
    }
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) {
      throw new CustomFieldError(`Duplicate custom field label "${label}".`);
    }
    seenLabels.add(labelKey);

    const value = raw?.value === undefined || raw?.value === null ? null : raw.value;
    if (value !== null && typeof value !== "string") {
      throw new CustomFieldError(`Custom field "${label}" has an invalid value.`);
    }
    if (value !== null && value.length > MAX_VALUE_LENGTH) {
      throw new CustomFieldError(`Custom field "${label}" is too long (max ${MAX_VALUE_LENGTH} characters).`);
    }
    const id = typeof raw?.id === "string" && raw.id ? raw.id : null;
    if (!id && value === null) {
      throw new CustomFieldError(`Custom field "${label}" needs a value.`);
    }
    return { id, label, value };
  });
}

async function readBlob(secretRef: string | null): Promise<Record<string, string>> {
  if (!secretRef) return {};
  const parsed = JSON.parse(await fetchSecret(secretRef));
  return parsed && typeof parsed === "object" ? parsed : {};
}

/**
 * Replaces an account's custom fields with `fields` (full list, in display
 * order). Fields with an existing id and value === null keep their stored
 * value, so the edit form can rename/reorder/delete without the admin
 * re-entering secrets. Returns the resulting labels (for audit metadata).
 *
 * The secret is written before the DB rows: GCP refs are pinned versions,
 * so if the DB write fails the old ref still points at the old blob.
 */
export async function saveCustomFields(
  account: { id: string; customFieldsSecretRef: string | null },
  fields: CustomFieldInput[],
): Promise<string[]> {
  const existingRows = await prisma.accountCustomField.findMany({
    where: { accountId: account.id },
    select: { id: true },
  });
  const existingIds = new Set(existingRows.map((r) => r.id));
  const needsOldValues = fields.some((f) => f.value === null);
  const oldValues = needsOldValues ? await readBlob(account.customFieldsSecretRef) : {};

  const resolved = fields.map((f) => {
    const keepId = f.id && existingIds.has(f.id) ? f.id : null;
    const value = f.value ?? (keepId ? oldValues[keepId] : undefined);
    if (value === undefined) {
      throw new CustomFieldError(`Custom field "${f.label}" needs a value.`);
    }
    return { id: keepId || crypto.randomUUID(), label: f.label, value };
  });

  let newRef: string | null = null;
  if (resolved.length > 0) {
    const blob = JSON.stringify(Object.fromEntries(resolved.map((f) => [f.id, f.value])));
    newRef = account.customFieldsSecretRef
      ? await updateSecret(account.customFieldsSecretRef, blob)
      : await storeSecret(blob);
  }

  await prisma.$transaction([
    prisma.accountCustomField.deleteMany({ where: { accountId: account.id } }),
    prisma.accountCustomField.createMany({
      data: resolved.map((f, position) => ({
        id: f.id,
        accountId: account.id,
        label: f.label,
        position,
      })),
    }),
    prisma.account.update({
      where: { id: account.id },
      data: { customFieldsSecretRef: newRef },
    }),
  ]);

  if (!newRef && account.customFieldsSecretRef) {
    await deleteCustomFieldsSecret(account.customFieldsSecretRef);
  }

  return resolved.map((f) => f.label);
}

/** Ordered [{id, label, value}] for the reveal response. */
export async function readCustomFieldValues(
  account: { id: string; customFieldsSecretRef: string | null },
): Promise<CustomFieldValue[]> {
  const rows = await prisma.accountCustomField.findMany({
    where: { accountId: account.id },
    orderBy: { position: "asc" },
    select: { id: true, label: true },
  });
  if (rows.length === 0) return [];
  const values = await readBlob(account.customFieldsSecretRef);
  return rows.map((r) => ({ id: r.id, label: r.label, value: values[r.id] ?? "" }));
}

/** Best-effort cleanup of the blob when an account is deleted. */
export async function deleteCustomFieldsSecret(secretRef: string | null): Promise<void> {
  if (!secretRef) return;
  try {
    await deleteSecret(secretRef);
  } catch (e) {
    console.error("[Custom Fields] Failed to delete secret", e);
  }
}

/** Prisma select for the label metadata returned on GET routes. */
export const customFieldLabelsSelect = {
  select: { id: true, label: true },
  orderBy: { position: "asc" as const },
};
