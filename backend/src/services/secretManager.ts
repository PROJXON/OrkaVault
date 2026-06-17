/**
 * Secret Manager Service
 *
 * In production: uses Google Cloud Secret Manager to store/fetch raw passwords.
 * In development: uses a file-backed JSON store that persists across restarts.
 *
 * Raw passwords are NEVER stored in PostgreSQL — only the secretRef is stored.
 */

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import * as fs from "fs";
import * as path from "path";

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const USE_GCP =
  process.env.NODE_ENV === "production" &&
  !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

// ─── File-backed Local Store ────────────────────────────────────────────
// Persists to disk so secrets survive backend restarts in dev mode.
const DEV_STORE_PATH = path.join(__dirname, "../../.dev-secret-store.json");

function loadLocalStore(): Record<string, string> {
  try {
    if (fs.existsSync(DEV_STORE_PATH)) {
      const raw = fs.readFileSync(DEV_STORE_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("[SecretManager:Local] Could not load store, starting fresh.");
  }
  return {};
}

function saveLocalStore(store: Record<string, string>): void {
  try {
    fs.writeFileSync(DEV_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.error("[SecretManager:Local] Failed to persist store:", e);
  }
}

let localSecretStore: Record<string, string> = loadLocalStore();
let localCounter = Object.keys(localSecretStore).length;

let smClient: SecretManagerServiceClient | null = null;
if (USE_GCP) {
  smClient = new SecretManagerServiceClient();
}

/**
 * Store a raw password in Secret Manager (or local fallback).
 * Returns the secretRef string to be stored in PostgreSQL.
 */
export async function storeSecret(password: string): Promise<string> {
  if (USE_GCP && smClient) {
    return storeSecretGCP(password);
  }
  return storeSecretLocal(password);
}

/**
 * Fetch a raw password from Secret Manager using its secretRef.
 */
export async function fetchSecret(secretRef: string): Promise<string> {
  if (USE_GCP && smClient) {
    return fetchSecretGCP(secretRef);
  }
  return fetchSecretLocal(secretRef);
}

/**
 * Update an existing secret. Returns the new secretRef.
 */
export async function updateSecret(
  oldSecretRef: string,
  newPassword: string,
): Promise<string> {
  if (USE_GCP && smClient) {
    return updateSecretGCP(oldSecretRef, newPassword);
  }
  return updateSecretLocal(oldSecretRef, newPassword);
}

/**
 * Delete a secret completely.
 */
export async function deleteSecret(secretRef: string): Promise<void> {
  if (USE_GCP && smClient) {
    return deleteSecretGCP(secretRef);
  }
  return deleteSecretLocal(secretRef);
}

// ─── GCP Implementation ────────────────────────────────────────────────

async function storeSecretGCP(password: string): Promise<string> {
  const secretId = `orkavault-cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parent = `projects/${GCP_PROJECT_ID}`;

  await smClient!.createSecret({
    parent,
    secretId,
    secret: { replication: { automatic: {} } },
  });

  const [version] = await smClient!.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(password, "utf8") },
  });

  return version.name!;
}

async function fetchSecretGCP(secretRef: string): Promise<string> {
  const [version] = await smClient!.accessSecretVersion({ name: secretRef });
  const payload = version.payload?.data;
  if (!payload) throw new Error("Secret payload is empty");
  return typeof payload === "string"
    ? payload
    : Buffer.from(payload).toString("utf8");
}

async function updateSecretGCP(
  oldSecretRef: string,
  newPassword: string,
): Promise<string> {
  const secretName = oldSecretRef
    .replace(/\/versions\/\d+$/, "")
    .replace(/\/versions\/latest$/, "");
  const [version] = await smClient!.addSecretVersion({
    parent: secretName,
    payload: { data: Buffer.from(newPassword, "utf8") },
  });
  return version.name!;
}

async function deleteSecretGCP(secretRef: string): Promise<void> {
  const secretName = secretRef
    .replace(/\/versions\/\d+$/, "")
    .replace(/\/versions\/latest$/, "");
  await smClient!.deleteSecret({ name: secretName });
}

// ─── Local File-backed Implementation ──────────────────────────────────

function storeSecretLocal(password: string): string {
  localCounter++;
  const ref = `local-secret-ref-${localCounter}-${Date.now()}`;
  localSecretStore[ref] = password;
  saveLocalStore(localSecretStore);
  console.log(`[SecretManager:Local] Stored secret ref: ${ref}`);
  return ref;
}

function fetchSecretLocal(secretRef: string): string {
  const password = localSecretStore[secretRef];
  if (password === undefined) {
    throw new Error(`Secret not found for ref: ${secretRef}`);
  }
  return password;
}

function updateSecretLocal(oldSecretRef: string, newPassword: string): string {
  delete localSecretStore[oldSecretRef];
  return storeSecretLocal(newPassword);
}

function deleteSecretLocal(secretRef: string): void {
  delete localSecretStore[secretRef];
  saveLocalStore(localSecretStore);
}
