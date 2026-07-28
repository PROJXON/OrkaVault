/**
 * Google Workspace Admin SDK Monitoring Service
 *
 * Two independent things live here, both behind the same domain-wide
 * delegation credential:
 * - Polls the Reports API (`activities.list` for "login" and "token"
 *   applicationName) for Workspace login/OAuth-grant *events* and
 *   persists them to WorkspaceActivityEvent (an append-only audit trail).
 * - Syncs the Directory API's `tokens.list` per user into ConnectedApp —
 *   a current-state *snapshot* of each user's connected third-party apps
 *   (not an event log; stale rows are deleted when an app disappears).
 *
 * Requires domain-wide delegation: a GCP service account impersonating a
 * Workspace super-admin. See docs/google-workspace-admin-sdk-monitoring.md
 * for the design.
 *
 * Not configured until GOOGLE_WORKSPACE_ADMIN_EMAIL is set and a service
 * account key file exists at GOOGLE_WORKSPACE_SA_KEY_PATH — until then,
 * ingestWorkspaceActivity()/syncConnectedApps() are no-ops (logged once,
 * not every tick).
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
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
];

let warnedNotConfigured = false;

// Connected Apps: how many users' tokens.list calls run at once. Google
// doesn't bill Admin SDK calls, but does rate-limit them — this trades
// speed against 429s, backed up by withRetry429 below for whatever
// bursts through anyway.
const CONNECTED_APPS_SYNC_CONCURRENCY = 10;

function is429(error: any): boolean {
  return error?.response?.status === 429 || error?.status === 429 || error?.code === 429;
}

/** Retries only on 429 (rate limit) — any other error propagates immediately. Exponential backoff + jitter, honors Retry-After if Google sends one. */
async function withRetry429<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (!is429(error) || attempt >= maxRetries) throw error;
      const retryAfterHeader = error?.response?.headers?.["retry-after"];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      const backoffMs = retryAfterMs ?? Math.min(1000 * 2 ** attempt, 20000) + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

/**
 * Runs fn over items with at most `limit` in flight at once (a fixed pool
 * of workers pulling from a shared index), instead of either fully
 * sequential (slow) or Promise.all-everything (risks a burst of 429s).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (error) {
        results[i] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// Google's Reports API has documented multi-hour ingestion lag, and an
// event can surface after a *later* event from the other applicationName
// stream (login vs. token) has already been ingested. A watermark anchored
// to "the latest event we've seen" would then permanently skip it, since
// every subsequent poll asks Google for activity after that point. A
// rolling lookback window avoids that race — alreadyIngested() dedupes the
// re-scanned overlap — at the cost of re-fetching a wider range each poll.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export function isWorkspaceMonitoringConfigured(): boolean {
  return !!ADMIN_EMAIL && fs.existsSync(SA_KEY_PATH);
}

let cachedKeyFile: { client_email: string; private_key: string; client_id?: string } | null = null;

function getServiceAccountKey() {
  if (!cachedKeyFile) {
    cachedKeyFile = JSON.parse(fs.readFileSync(SA_KEY_PATH, "utf-8"));
  }
  return cachedKeyFile!;
}

/**
 * Our own service account's OAuth Client ID. Domain-wide delegation makes
 * every one of our API calls (impersonating ADMIN_EMAIL) look, from
 * Google's side, exactly like that admin authorizing this client — so it
 * shows up in Reports API "token" activity as an oauth_token_grant with
 * this value as appName. That's not a real third-party app connecting;
 * it's our own polling. ingestWorkspaceActivity() filters it out below.
 */
function getOwnClientId(): string | undefined {
  return getServiceAccountKey().client_id;
}

// Reused across every call in the process, not rebuilt per-request: the
// JWT client from google-auth-library caches/refreshes its own access
// token internally when reused, so this cuts token-endpoint round trips
// down to roughly one per hour (whenever the cached token actually
// expires) instead of one per Google API call. That matters a lot now —
// syncConnectedApps() calls this once per active user, concurrently, and
// a fresh JWT instance every time meant a fresh token exchange every
// time too (see "JWT.refreshTokenNoCache" in any auth-error stack trace).
let cachedAuthClient: JWT | null = null;

function getAuthClient(): JWT {
  if (cachedAuthClient) return cachedAuthClient;
  const keyFile = getServiceAccountKey();
  cachedAuthClient = new JWT({
    email: keyFile.client_email,
    key: keyFile.private_key,
    scopes: SCOPES,
    subject: ADMIN_EMAIL,
  });
  return cachedAuthClient;
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

export interface WorkspaceUser {
  email: string;
  displayName: string | null;
}

/**
 * Enumerate every non-suspended Workspace user org-wide (Directory API,
 * paginated). Used to know which userKeys to call tokens.list for —
 * Reports API's userKey: "all" has no Directory API equivalent, so this
 * has to walk the full directory itself. Also backs
 * workspaceAccountSync.ts's vault-entry provisioning, which needs a
 * display name, not just the email.
 */
export async function listActiveWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const auth = getAuthClient();
  const directory = google.admin({ version: "directory_v1", auth });

  const users: WorkspaceUser[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry429(() =>
      directory.users.list({
        customer: "my_customer",
        maxResults: 500,
        pageToken,
      }),
    );
    for (const user of res.data.users || []) {
      if (user.primaryEmail && !user.suspended) {
        users.push({
          email: user.primaryEmail,
          displayName: user.name?.fullName ?? user.name?.displayName ?? null,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return users;
}

export interface NormalizedConnectedApp {
  clientId: string;
  appName: string | null;
  scopes: string[];
  nativeApp: boolean;
  anonymous: boolean;
}

/** Current OAuth grants for one user (Directory API tokens.list) — a snapshot, not history. */
export async function fetchConnectedApps(userEmail: string): Promise<NormalizedConnectedApp[]> {
  const auth = getAuthClient();
  const directory = google.admin({ version: "directory_v1", auth });

  const res = await withRetry429(() => directory.tokens.list({ userKey: userEmail }));
  const items = res.data.items || [];
  return items
    .filter((item): item is typeof item & { clientId: string } => !!item.clientId)
    .map((item) => ({
      clientId: item.clientId,
      appName: item.displayText ?? null,
      scopes: item.scopes ?? [],
      nativeApp: !!item.nativeApp,
      anonymous: !!item.anonymous,
    }));
}

/**
 * Fetches one user's current connected apps from Google and syncs
 * ConnectedApp to match (upsert + delete-stale). Shared by the bulk cron
 * below and the on-demand per-user route, so there's one place that owns
 * the upsert/delete-stale logic. Can throw — callers decide how to handle
 * a single user's failure (skip-and-continue for the cron, surface as a
 * 500 for the on-demand route).
 *
 * Returns the persisted ConnectedApp rows (with id/lastSeenAt), not the
 * raw Google response shape — callers (including the API route) render
 * these directly, and NormalizedConnectedApp has neither field.
 */
export async function syncConnectedAppsForUser(userEmail: string) {
  const apps = await fetchConnectedApps(userEmail);

  for (const app of apps) {
    await prisma.connectedApp.upsert({
      where: { userEmail_clientId: { userEmail, clientId: app.clientId } },
      update: {
        appName: app.appName,
        scopes: app.scopes,
        nativeApp: app.nativeApp,
        anonymous: app.anonymous,
        lastSeenAt: new Date(),
      },
      create: {
        userEmail,
        clientId: app.clientId,
        appName: app.appName,
        scopes: app.scopes,
        nativeApp: app.nativeApp,
        anonymous: app.anonymous,
      },
    });
  }

  await prisma.connectedApp.deleteMany({
    where: { userEmail, clientId: { notIn: apps.map((a) => a.clientId) } },
  });

  return prisma.connectedApp.findMany({ where: { userEmail }, orderBy: { appName: "asc" } });
}

/**
 * Cron entry point: syncs ConnectedApp to match Google's current state for
 * every active Workspace user, up to CONNECTED_APPS_SYNC_CONCURRENCY at a
 * time (each call also retries once-off 429s via withRetry429 inside
 * fetchConnectedApps). Never throws, like ingestWorkspaceActivity — one
 * user's failure is logged and skipped, not fatal to the rest.
 */
export async function syncConnectedApps(): Promise<void> {
  if (!isWorkspaceMonitoringConfigured()) return;

  try {
    const workspaceUsers = await listActiveWorkspaceUsers();
    let userCount = 0;
    let appCount = 0;

    const results = await mapWithConcurrency(workspaceUsers, CONNECTED_APPS_SYNC_CONCURRENCY, ({ email }) =>
      syncConnectedAppsForUser(email),
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        userCount++;
        appCount += result.value.length;
      } else {
        console.error(`[ConnectedApps] Failed to fetch tokens for ${workspaceUsers[i].email}:`, result.reason);
      }
    });

    console.log(`[ConnectedApps] Synced ${userCount} users, ${appCount} apps.`);
  } catch (error) {
    console.error("[ConnectedApps] Sync failed:", error);
  }
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
    const since = new Date(Date.now() - LOOKBACK_MS);

    const ownClientId = getOwnClientId();
    const events = (await fetchActivitySince(since)).filter(
      (event) => !ownClientId || event.appName !== ownClientId,
    );
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
