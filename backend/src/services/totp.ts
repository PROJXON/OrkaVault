/**
 * TOTP Service
 *
 * Admins upload a screenshot/photo of an authenticator QR code when
 * setting up a Google Workspace account. Rather than just storing that
 * image and handing it back out on every reveal, we decode it server-side
 * to confirm it's really a TOTP QR code and, on demand, compute the
 * current 6-digit code from it — so day-to-day access only ever needs the
 * rotating code, never the underlying secret or the raw QR image itself
 * (that stays admin-only, see routes/accounts.ts reveal-qr).
 */
import { Jimp } from "jimp";
import jsQR from "jsqr";
import { generate } from "otplib";

const TOTP_PERIOD_SECONDS = 30;

function toBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

/** Decodes a base64 image (data URL or bare base64) and returns the raw text encoded in its QR code. */
export async function decodeQrImage(dataUrl: string): Promise<string> {
  let image;
  try {
    image = await Jimp.read(toBuffer(dataUrl));
  } catch (e) {
    throw new Error("Could not read that image file.");
  }

  const { data, width, height } = image.bitmap;
  const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const result = jsQR(clamped, width, height);

  if (!result) {
    throw new Error("Could not find a QR code in the uploaded image.");
  }
  return result.data;
}

/** Pulls the base32 TOTP secret out of an `otpauth://totp/...` URI. */
export function extractTotpSecret(otpauthUri: string): string {
  if (!otpauthUri.startsWith("otpauth://totp/")) {
    throw new Error("That QR code is not a valid TOTP authenticator code.");
  }
  let url: URL;
  try {
    url = new URL(otpauthUri);
  } catch (e) {
    throw new Error("That QR code is not a valid TOTP authenticator code.");
  }
  const secret = url.searchParams.get("secret");
  if (!secret) {
    throw new Error("That QR code is missing its TOTP secret.");
  }
  return secret;
}

/** Throws if the uploaded image isn't a decodable, valid TOTP QR code. Used to validate uploads. */
export async function validateTotpQrImage(dataUrl: string): Promise<void> {
  const uri = await decodeQrImage(dataUrl);
  extractTotpSecret(uri);
}

/** Decodes the stored QR image and computes the current OTP + seconds until it rotates. */
export async function generateOtpFromQrImage(
  dataUrl: string,
): Promise<{ otp: string; secondsRemaining: number }> {
  const uri = await decodeQrImage(dataUrl);
  const secret = extractTotpSecret(uri);
  const otp = await generate({ secret });
  const epoch = Math.floor(Date.now() / 1000);
  const secondsRemaining = TOTP_PERIOD_SECONDS - (epoch % TOTP_PERIOD_SECONDS);
  return { otp, secondsRemaining };
}
