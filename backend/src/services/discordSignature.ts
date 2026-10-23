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

// The signature covers the timestamp but nothing stops a captured request
// from being re-sent later. Reject anything outside this window so a
// replayed interaction can't act again.
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string | Buffer,
): boolean {
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return false;
  }
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
