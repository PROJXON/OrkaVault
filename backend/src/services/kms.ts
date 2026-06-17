import crypto from "crypto";
import fs from "fs";
import path from "path";

// Local key storage path for developer fallback when GCP KMS is not configured
const LOCAL_KMS_KEY_PATH = path.join(__dirname, "../../local_master.key");

/**
 * Retrieves or generates a local 256-bit Master Key for envelope encryption fallback.
 */
function getLocalMasterKey(): Buffer {
  if (fs.existsSync(LOCAL_KMS_KEY_PATH)) {
    return fs.readFileSync(LOCAL_KMS_KEY_PATH);
  }
  const masterKey = crypto.randomBytes(32);
  fs.writeFileSync(LOCAL_KMS_KEY_PATH, masterKey);
  return masterKey;
}

/**
 * Encrypts data using AES-256-GCM.
 * In a full production environment, this ciphertext is wrapped by a key retrieved from Google Cloud KMS.
 * For this MVP, we simulate envelope encryption with a local master key.
 */
export function encryptPassword(plaintext: string): {
  ciphertext: Buffer;
  iv: Buffer;
} {
  const iv = crypto.randomBytes(12);
  const masterKey = getLocalMasterKey();

  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine encrypted data + auth tag
  const ciphertext = Buffer.concat([encrypted, authTag]);

  return { ciphertext, iv };
}

/**
 * Decrypts password using AES-256-GCM envelope key.
 * Memory safety: The returned Buffer contains the decrypted plaintext.
 * Caller MUST call zeroOutBuffer(plaintextBuffer) immediately after sending the response.
 */
export function decryptPassword(ciphertext: Buffer, iv: Buffer): Buffer {
  const masterKey = getLocalMasterKey();

  // Extract auth tag (last 16 bytes for GCM)
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encryptedData = ciphertext.subarray(0, ciphertext.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted;
}

/**
 * Actively overwrites a buffer with zeros in memory to prevent memory residue attacks.
 */
export function zeroOutBuffer(buf: Buffer): void {
  buf.fill(0);
}
