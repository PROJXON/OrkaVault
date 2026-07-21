/**
 * Google Workspace Admin SDK Monitoring Service
 *
 * Polls the Reports API (`activities.list` for "login" and "token"
 * applicationName) for Workspace login/OAuth-grant activity and persists
 * it to WorkspaceActivityEvent. Requires domain-wide delegation: a GCP
 * service account impersonating a Workspace super-admin.
 *
 * See docs/google-workspace-admin-sdk-monitoring.md for the design.
 *
 * Not configured until GOOGLE_WORKSPACE_ADMIN_EMAIL is set and a service
 * account key file exists at GOOGLE_WORKSPACE_SA_KEY_PATH — until then,
 * ingestWorkspaceActivity() is a no-op (logged once, not every tick).
 */

import * as fs from "fs";
import * as path from "path";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { PrismaClient, NotifType } from "@prisma/client";
import { notifyAdmins } from "./notifications";
import { sendChatAlert } from "./webhookAlerts";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || "";
const SA_KEY_PATH = path.resolve(
  process.env.GOOGLE_WORKSPACE_SA_KEY_PATH ||
    path.join(__dirname, "../../local_workspace_sa_key.json"),
);

const SCOPES = [
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.security",
];

let warnedNotConfigured = false;

export function isWorkspaceMonitoringConfigured(): boolean {
  return !!ADMIN_EMAIL && fs.existsSync(SA_KEY_PATH);
}

function getAuthClient(): JWT {
  const keyFile = JSON.parse(fs.readFileSync(SA_KEY_PATH, "utf-8"));
  return new JWT({
    email: keyFile.client_email,
    key: keyFile.private_key,
    scopes: SCOPES,
    subject: ADMIN_EMAIL,
  });
}

export interface NormalizedActivityEvent {
  userEmail: string;
  eventType: string;
  appName: string | null;
  ipAddress: string | null;
  occurredAt: Date;
  uniqueQualifier: string | null;
  raw: unknown;
}

function normalize(
  applicationName: "login" | "token",
  item: any,
): NormalizedActivityEvent[] {
  const userEmail: string = item.actor?.email || "";
  const occurredAt = new Date(item.id?.time);
  const uniqueQualifier = item.id?.uniqueQualifier ?? null;
  const ipAddress = item.ipAddress ?? null;

  const events = Array.isArray(item.events) ? item.events : [];
  return events.map((ev: any) => {
    let eventType = ev.name || (applicationName === "login" ? "login_success" : "oauth_token_grant");
    if (applicationName === "token") {
      // Google's token audit events use names like "authorize" / "revoke".
      eventType = eventType === "revoke" ? "oauth_token_revoke" : "oauth_token_grant";
    }
    const appNameParam = (ev.parameters || []).find(
      (p: any) => p.name === "application_name" || p.name === "client_id",
    );
    return {
      userEmail,
      eventType,
      appName: applicationName === "token" ? appNameParam?.value ?? null : null,
      ipAddress,
      occurredAt,
      uniqueQualifier,
      raw: item,
    };
  });
}

/**
 * Fetch login + token activity since a given timestamp. Scope is all
 * Workspace users org-wide (userKey: "all"), per the answered open
 * question in the design doc.
 */
export async function fetchActivitySince(since: Date): Promise<NormalizedActivityEvent[]> {
  const auth = getAuthClient();
  const reports = google.admin({ version: "reports_v1", auth });

  const results: NormalizedActivityEvent[] = [];
  for (const applicationName of ["login", "token"] as const) {
    const res = await reports.activities.list({
      userKey: "all",
      applicationName,
      startTime: since.toISOString(),
      maxResults: 1000,
    });
    const items = res.data.items || [];
    for (const item of items) {
      results.push(...normalize(applicationName, item));
    }
  }
  return results;
}

interface AlertResult {
  flagged: boolean;
  notifType?: NotifType;
  detail?: string;
}

function ipInAllowlist(ip: string, allowlist: string[]): boolean {
  // Exact-match / simple-prefix check. Full CIDR range matching is a
  // reasonable follow-up if the allow-list ever needs to hold ranges
  // rather than individual addresses — not built here since we don't yet
  // have real Workspace IP data to validate the matching logic against.
  return allowlist.some((entry) => ip === entry || ip.startsWith(entry));
}

/**
 * Encodes the three alert triggers the user asked for. Every event is
 * still persisted regardless of this result — `flagged` only controls
 * whether a notification/chat alert fires.
 */
export async function evaluateAlert(event: NormalizedActivityEvent): Promise<AlertResult> {
  if (event.eventType === "suspicious_login") {
    return { flagged: true, notifType: "WORKSPACE_SUSPICIOUS_LOGIN", detail: event.ipAddress ?? undefined };
  }

  if (event.eventType === "oauth_token_grant") {
    return {
      flagged: true,
      notifType: "WORKSPACE_NEW_OAUTH_APP",
      detail: event.appName ?? undefined,
    };
  }

  if (event.eventType === "login_success" || event.eventType === "login_failure") {
    const [ipPolicy, countryPolicy] = await Promise.all([
      prisma.organizationPolicy.findFirst({ where: { name: "WORKSPACE_ALLOWED_IPS" } }),
      prisma.organizationPolicy.findFirst({ where: { name: "WORKSPACE_ALLOWED_COUNTRIES" } }),
    ]);

    const allowedIps = (ipPolicy?.enabled && ipPolicy.value ? ipPolicy.value.split(",") : [])
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowedIps.length > 0 && event.ipAddress && !ipInAllowlist(event.ipAddress, allowedIps)) {
      return { flagged: true, notifType: "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION", detail: event.ipAddress };
    }

    // Country matching is best-effort: Google's login event payload does
    // not reliably carry a plain country field across all editions/event
    // types. We only check it if the raw event happens to expose one;
    // otherwise this rule is a no-op rather than a false negative we'd
    // have to defend. See docs/google-workspace-admin-sdk-monitoring.md.
    const allowedCountries = (
      countryPolicy?.enabled && countryPolicy.value ? countryPolicy.value.split(",") : []
    )
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const rawCountry = (event.raw as any)?.events?.find((e: any) =>
      (e.parameters || []).some((p: any) => p.name === "login_challenge_method" || p.name === "country"),
    );
    const countryParam = rawCountry?.parameters?.find((p: any) => p.name === "country");
    if (allowedCountries.length > 0 && countryParam?.value) {
      const country = String(countryParam.value).toUpperCase();
      if (!allowedCountries.includes(country)) {
        return { flagged: true, notifType: "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION", detail: country };
      }
    }
  }

  return { flagged: false };
}

async function alreadyIngested(event: NormalizedActivityEvent): Promise<boolean> {
  const existing = await prisma.workspaceActivityEvent.findFirst({
    where: event.uniqueQualifier
      ? { userEmail: event.userEmail, eventType: event.eventType, uniqueQualifier: event.uniqueQualifier }
      : { userEmail: event.userEmail, eventType: event.eventType, occurredAt: event.occurredAt },
  });
  return !!existing;
}

const CHAT_EVENT_BY_NOTIF: Partial<Record<NotifType, "WORKSPACE_SUSPICIOUS_LOGIN" | "WORKSPACE_NEW_OAUTH_APP" | "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION">> = {
  WORKSPACE_SUSPICIOUS_LOGIN: "WORKSPACE_SUSPICIOUS_LOGIN",
  WORKSPACE_NEW_OAUTH_APP: "WORKSPACE_NEW_OAUTH_APP",
  WORKSPACE_LOGIN_ALLOWLIST_VIOLATION: "WORKSPACE_LOGIN_ALLOWLIST_VIOLATION",
};

/**
 * Cron entry point: fire-and-forget, like the other two crons in
 * index.ts. Never throws — a Workspace API outage or missing config must
 * never crash the server.
 */
export async function ingestWorkspaceActivity(): Promise<void> {
  if (!isWorkspaceMonitoringConfigured()) {
    if (!warnedNotConfigured) {
      console.log(
        "[WorkspaceActivity] Not configured (GOOGLE_WORKSPACE_ADMIN_EMAIL / service account key missing) — skipping.",
      );
      warnedNotConfigured = true;
    }
    return;
  }

  try {
    const latest = await prisma.workspaceActivityEvent.findFirst({
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    const since = latest?.occurredAt ?? new Date(Date.now() - 60 * 60 * 1000);

    const events = await fetchActivitySince(since);
    let flaggedCount = 0;

    for (const event of events) {
      if (!event.userEmail || await alreadyIngested(event)) continue;

      const alert = await evaluateAlert(event);
      await prisma.workspaceActivityEvent.create({
        data: {
          userEmail: event.userEmail,
          eventType: event.eventType,
          appName: event.appName,
          ipAddress: event.ipAddress,
          flagged: alert.flagged,
          occurredAt: event.occurredAt,
          uniqueQualifier: event.uniqueQualifier,
          raw: event.raw as any,
        },
      });

      if (alert.flagged && alert.notifType) {
        flaggedCount++;
        const title = alert.notifType.replace(/_/g, " ");
        const body = `${event.userEmail}: ${title}${alert.detail ? ` (${alert.detail})` : ""}`;
        notifyAdmins(title, body, alert.notifType);

        const chatEvent = CHAT_EVENT_BY_NOTIF[alert.notifType];
        if (chatEvent) {
          sendChatAlert(chatEvent, {
            requesterName: event.userEmail,
            accountName: event.appName || event.ipAddress || "Workspace activity",
            detail: alert.detail,
            link: "/workspace-activity",
          });
        }
      }
    }

    if (events.length > 0) {
      console.log(
        `[WorkspaceActivity] Ingested ${events.length} events (${flaggedCount} flagged).`,
      );
    }
  } catch (error) {
    console.error("[WorkspaceActivity] Ingestion failed:", error);
  }
}
