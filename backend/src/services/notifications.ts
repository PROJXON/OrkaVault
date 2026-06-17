/**
 * Notification Service
 *
 * Handles:
 *  - Creating in-app Notification records in PostgreSQL
 *  - Sending emails via Gmail API (with console fallback in development)
 *  - Rate limiting: max 1 email per user per event type per hour
 *
 * Notifications are ALWAYS non-blocking (fire-and-forget).
 * A notification failure must NEVER block the main action.
 */

import { PrismaClient, NotifType, User } from "@prisma/client";

const prisma = new PrismaClient();

// Rate-limiting tracker: key = `${userId}:${type}`, value = last sent timestamp
const emailRateMap = new Map<string, number>();
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create an in-app notification for a single user.
 * Optionally sends an email if user.notificationsOn is true.
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  type: NotifType,
  sendEmail: boolean = true,
): Promise<void> {
  try {
    // Create in-app notification record
    await prisma.notification.create({
      data: { userId, title, body, type },
    });

    if (sendEmail) {
      // Fetch user to check notification preference
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user && user.notificationsOn) {
        await sendEmailToUser(user, title, body, type);
      }
    }
  } catch (error) {
    // Non-blocking: log and continue
    console.error(`[Notification] Failed to notify user ${userId}:`, error);
  }
}

/**
 * Notify all users with a specific role.
 */
export async function notifyByRole(
  role: "ADMIN" | "MANAGER" | "HOLDER",
  title: string,
  body: string,
  type: NotifType,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role, active: true },
    });

    // Fire-and-forget all notifications in parallel
    await Promise.allSettled(
      users.map((user) => notifyUser(user.id, title, body, type)),
    );
  } catch (error) {
    console.error(`[Notification] Failed to notify role ${role}:`, error);
  }
}

/**
 * Notify all admins.
 */
export async function notifyAdmins(
  title: string,
  body: string,
  type: NotifType,
): Promise<void> {
  await notifyByRole("ADMIN", title, body, type);
}

/**
 * Notify all managers and admins.
 */
export async function notifyManagersAndAdmins(
  title: string,
  body: string,
  type: NotifType,
): Promise<void> {
  await Promise.allSettled([
    notifyByRole("ADMIN", title, body, type),
    notifyByRole("MANAGER", title, body, type),
  ]);
}

/**
 * Send email to a user (rate-limited).
 * In development, logs to console. In production, uses Gmail API.
 */
async function sendEmailToUser(
  user: User,
  title: string,
  body: string,
  type: NotifType,
): Promise<void> {
  try {
    // Rate limit check
    const rateKey = `${user.id}:${type}`;
    const lastSent = emailRateMap.get(rateKey) || 0;
    if (Date.now() - lastSent < RATE_LIMIT_MS) {
      console.log(`[Email] Rate limited for user ${user.email}, type ${type}`);
      return;
    }

    if (
      process.env.NODE_ENV === "production" &&
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      await sendGmailApiEmail(user.email, title, body);
    } else {
      // Console fallback for development
      console.log(
        `[Email:Dev] To: ${user.email} | Subject: ${title} | Body: ${body}`,
      );
    }

    // Update rate limit tracker
    emailRateMap.set(rateKey, Date.now());
  } catch (error) {
    // Email failures are non-blocking
    console.error(`[Email] Failed to send to ${user.email}:`, error);
  }
}

/**
 * Send email via Gmail API using service account.
 * Requires GOOGLE_APPLICATION_CREDENTIALS and GMAIL_SENDER env vars.
 */
async function sendGmailApiEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
    });
    const gmail = google.gmail({ version: "v1", auth });

    const sender = process.env.GMAIL_SENDER || "noreply@projxon.com";
    const rawMessage = [
      `From: OrkaVault <${sender}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      "",
      `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">`,
      `<h2 style="color:#1a73e8;">OrkaVault</h2>`,
      `<p>${body}</p>`,
      `<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">`,
      `<p style="color:#999;font-size:12px;">This is an automated message from OrkaVault. Do not reply.</p>`,
      `</div>`,
    ].join("\n");

    const encodedMessage = Buffer.from(rawMessage).toString("base64url");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`[Gmail API] Failed to send email to ${to}:`, error);
  }
}
