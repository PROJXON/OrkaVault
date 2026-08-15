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

import crypto from "crypto";

// ─── Ephemeral-Safe Local Implementation ──────────────────────────────────
// Instead of saving to a local JSON file (which gets wiped on Render restarts),
// we encrypt the password and return the encrypted payload as the "secretRef".
// This allows the database to safely store the password without requiring a persistent disk.

// Use a dedicated SECRET_ENCRYPTION_KEY, falling back to DATABASE_URL or a default key
const rawKey = process.env.SECRET_ENCRYPTION_KEY || process.env.DATABASE_URL || "fallback_default_secret_key_12345678901234567890123456789012";
const ENCRYPTION_KEY = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32));
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function storeSecretLocal(password: string): string {
  const ref = "ENC_" + encrypt(password);
  console.log(`[SecretManager:Local] Encrypted password into ref.`);
  return ref;
}

function fetchSecretLocal(secretRef: string): string {
  if (secretRef.startsWith("ENC_")) {
    return decrypt(secretRef.slice(4));
  }
  
  // Fallback for old file-backed secrets (if the file happens to exist)
  if (localSecretStore[secretRef]) {
    return localSecretStore[secretRef];
  }
  
  throw new Error(`Secret not found for ref: ${secretRef}. This is likely because the server restarted and the ephemeral file system wiped the old development secrets. Please delete this vault entry and create a new one.`);
}

function updateSecretLocal(oldSecretRef: string, newPassword: string): string {
  // We don't need to delete the old one since it's just a string, we just return a new encrypted string
  if (localSecretStore[oldSecretRef]) {
    delete localSecretStore[oldSecretRef];
    saveLocalStore(localSecretStore);
  }
  return storeSecretLocal(newPassword);
}

function deleteSecretLocal(secretRef: string): void {
  // If it's an encrypted string, there's nothing to delete from disk
  if (localSecretStore[secretRef]) {
    delete localSecretStore[secretRef];
    saveLocalStore(localSecretStore);
  }
}

