import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import "dotenv/config";

const prisma = new PrismaClient();

const OLD_KEY_STRING = process.env.OLD_DATABASE_URL;
const NEW_KEY_STRING = process.env.ENCRYPTION_KEY;

if (!OLD_KEY_STRING) {
  console.error("FATAL: OLD_DATABASE_URL environment variable is missing.");
  process.exit(1);
}

if (!NEW_KEY_STRING || NEW_KEY_STRING.length < 32) {
  console.error("FATAL: ENCRYPTION_KEY environment variable is missing or less than 32 characters.");
  process.exit(1);
}

// Ensure the old key uses the exact padEnd logic that the old system used
const oldRawKey = OLD_KEY_STRING || "fallback_default_secret_key_12345678901234567890123456789012";
const OLD_ENCRYPTION_KEY = Buffer.from(oldRawKey.padEnd(32, "0").slice(0, 32));
const NEW_ENCRYPTION_KEY = Buffer.from(NEW_KEY_STRING.slice(0, 32));
const IV_LENGTH = 16;

function decryptOld(text: string): string {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", OLD_ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function encryptNew(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", NEW_ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return "ENC_" + iv.toString("hex") + ":" + encrypted.toString("hex");
}

async function run() {
  console.log("Starting Secret Migration...");
  
  const accounts = await prisma.account.findMany();
  let migratedCount = 0;
  
  for (const account of accounts) {
    if (account.secretRef.startsWith("ENC_")) {
      try {
        const encryptedPayload = account.secretRef.slice(4);
        // 1. Decrypt with OLD key
        const rawPassword = decryptOld(encryptedPayload);
        
        // 2. Encrypt with NEW key
        const newSecretRef = encryptNew(rawPassword);
        
        // 3. Update database
        await prisma.account.update({
          where: { id: account.id },
          data: { secretRef: newSecretRef }
        });
        
        migratedCount++;
        console.log(`Migrated account: ${account.name} (ID: ${account.id})`);
      } catch (err) {
        console.error(`Failed to migrate account ${account.name} (ID: ${account.id}). Incorrect old key?`, (err as Error).message);
      }
    }
  }
  
  console.log(`Migration Complete. Successfully re-encrypted ${migratedCount} secrets.`);
  await prisma.$disconnect();
}

run();

