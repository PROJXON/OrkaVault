/**
 * Verifies Discord's Ed25519 request signature (required before trusting
 * any POST to the Interactions Endpoint URL — see Discord's "Security"
 * docs). Implemented with Node's built-in crypto instead of adding a new
 * dependency (discord-interactions/tweetnacl): Discord hands out the raw
 * 32-byte Ed25519 public key as hex, so it's wrapped in the fixed SPKI DER
 * header Node's crypto.createPublicKey expects for format: "der".
 */
import crypto from "crypto";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string | Buffer,
): boolean {
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]);
    return crypto.verify(null, message, publicKey, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
