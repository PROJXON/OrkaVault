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
import { google, cloudidentity_v1 } from "googleapis";
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
  // NOTE: using the full "cloud-identity.devices" scope, not .readonly.
  // Domain-wide delegation authorization is matched by exact scope
  // string, not permission hierarchy — .readonly was rejected even
  // though the full scope was authorized for this client ID. This code
  // still only ever calls .list() (never wipe/block/delete) — the scope
  // is broader than what's used, but it's what's actually authorized.
  "https://www.googleapis.com/auth/cloud-identity.devices",
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

// gaxios/googleapis errors default to a useless top-level message
// ("Request failed with status code 403") — the actual reason Google
// rejected the request lives in error.response.data.error, which
// console.error(error) alone doesn't surface. Use this in every catch
// block that logs a Google API failure, not just the generic error object.
function describeGoogleApiError(error: any): string {
  const apiError = error?.response?.data?.error;
  if (apiError) {
    const status = apiError.status ?? apiError.code ?? error?.response?.status ?? "?";
    return `[${status}] ${apiError.message ?? JSON.stringify(apiError)}`;
  }
  return error?.message ?? String(error);
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

// Real third-party OAuth clients registered via Cloud Console always get a
// client_id formatted "<digits>-<hash>.apps.googleusercontent.com" (that's
// what shows up for every genuine app in Connected Apps). Service accounts
// — including ours — only ever get a bare numeric client_id, no domain
// suffix. So: an oauth_token_grant whose actor is our own impersonated
// ADMIN_EMAIL *and* whose client_id is bare-numeric is our own polling,
// even on the rare occasion the exact-match against getOwnClientId() above
// fails (e.g. a value-encoding quirk we haven't seen yet, or the service
// account key being rotated without a redeploy). Exact match is tried
// first since it's unambiguous; this is the fallback, not the primary check.
const BARE_NUMERIC_CLIENT_ID = /^\d+$/;
function isOwnPollingNoise(event: NormalizedActivityEvent, ownClientId: string | undefined): boolean {
  if (event.eventType !== "oauth_token_grant") return false;
  if (ownClientId && event.clientId === ownClientId) return true;
  return (
    !!ADMIN_EMAIL &&
    event.userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
    !!event.clientId &&
    BARE_NUMERIC_CLIENT_ID.test(event.clientId)
  );
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
  // Raw OAuth client_id, kept separate from appName (which may already be
  // the client_id itself, as a fallback — see below). Used for the
  // getOwnClientId() filter and for the ConnectedApp name-lookup fallback,
  // both of which need the *actual* client_id regardless of what ended up
  // in appName.
  clientId: string | null;
  ipAddress: string | null;
  // Top-level field on the Activity resource (`networkInfo`), not part of
  // events[].parameters. Approximate (IP-derived) and not always present.
  // Note there is deliberately no deviceType/deviceOsVersion here — Google's
  // userDeviceInfo field is NOT populated for login/token application
  // events at all (confirmed against Google's own coverage list — it's
  // scoped to Contact/Gemini/Keep/Meet/Chat/Chrome/Drive/Group/Rule/Looker
  // Studio/SAML, not login or token), so there is no per-event device data
  // to carry here regardless of device enrollment. Device info lives in
  // WorkspaceDevice instead (see syncWorkspaceDevices() below) — a
  // separate per-user snapshot from the Cloud Identity Devices API, not
  // correlated to individual events.
  regionCode: string | null;
  subdivisionCode: string | null;
  occurredAt: Date;
  uniqueQualifier: string | null;
  raw: unknown;
}

// A parameter's value can land in different fields depending on Google's
// declared type for it (value / multiValue / intValue / boolValue) — for
// name-like string parameters it should be `value`, but fall back to the
// first multiValue entry defensively since not every parameter's actual
// shape from the Reports API is documented reliably.
function paramValue(p: any): string | undefined {
  if (!p) return undefined;
  if (typeof p.value === "string") return p.value;
  if (Array.isArray(p.multiValue) && p.multiValue.length > 0) return p.multiValue[0];
  // client_id for our own service account is a bare number (no
  // ".apps.googleusercontent.com" suffix — that suffix only applies to
  // normal OAuth 2.0 Client IDs registered in Cloud Console, not service
  // accounts), so Google's Reports API may report it as intValue (int64,
  // encoded as a JSON string) rather than the string `value` field that
  // real third-party client_ids use. Missing this was why the
  // getOwnClientId() filter below stopped matching after appName parsing
  // was tightened up.
  if (p.intValue !== undefined && p.intValue !== null) return String(p.intValue);
  return undefined;
}

function normalize(
  applicationName: "login" | "token",
  item: any,
): NormalizedActivityEvent[] {
  const userEmail: string = item.actor?.email || "";
  const occurredAt = new Date(item.id?.time);
  const uniqueQualifier = item.id?.uniqueQualifier ?? null;
  const ipAddress = item.ipAddress ?? null;
  const regionCode = item.networkInfo?.regionCode ?? null;
  const subdivisionCode = item.networkInfo?.subdivisionCode ?? null;

  const events = Array.isArray(item.events) ? item.events : [];
  return events.map((ev: any) => {
    let eventType = ev.name || (applicationName === "login" ? "login_success" : "oauth_token_grant");
    if (applicationName === "token") {
      // Google's token audit events use names like "authorize" / "revoke".
      eventType = eventType === "revoke" ? "oauth_token_revoke" : "oauth_token_grant";
    }
    // Google's Token audit events carry the human-readable name under the
    // "app_name" parameter. Not every grant has one — unverified/internal
    // OAuth clients often don't get a friendly name from Google at all —
    // in which case we fall back to the raw client_id here, and
    // ingestWorkspaceActivity() below tries a second, better fallback
    // (a name already learned via the Connected Apps Directory-API sync)
    // before giving up and showing the raw client_id.
    const params = ev.parameters || [];
    const appNameParam = params.find((p: any) => p.name === "app_name");
    const clientIdParam = params.find((p: any) => p.name === "client_id");
    const clientId = applicationName === "token" ? paramValue(clientIdParam) ?? null : null;
    return {
      userEmail,
      eventType,
      appName: applicationName === "token" ? paramValue(appNameParam) ?? clientId ?? null : null,
      clientId,
      ipAddress,
      regionCode,
      subdivisionCode,
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

export interface NormalizedWorkspaceDevice {
  userEmail: string;
  deviceId: string;
  deviceType: string | null;
  model: string | null;
  osVersion: string | null;
  managementState: string | null;
  lastSyncTime: Date | null;
}

// Both Device and DeviceUser resource names start "devices/{id}/..." — that
// {id} segment is the reliable join key between the two, NOT the separate
// "deviceId" field on the Device object (that field is a distinct
// identifier, e.g. a serial-like value, and is not guaranteed to equal the
// resource name's path segment — keying the join off it was the original
// bug here: every device/deviceUser join silently missed, so Device
// fields came back null while DeviceUser fields like managementState
// (which don't depend on this join at all) populated fine).
function deviceResourceId(name: string | null | undefined): string | null {
  return name?.match(/^devices\/([^/]+)/)?.[1] ?? null;
}

type DeviceInfo = {
  deviceId: string;
  deviceType: string | null;
  model: string | null;
  osVersion: string | null;
  lastSyncTime: Date | null;
};

/**
 * Paginates devices.list into a resourceId -> device-attributes map.
 * `filter` uses the same "Mobile device search fields" vocabulary as the
 * legacy Directory API (e.g. "email:someone@domain.com") — confirmed via
 * Google's own how-to guide example ('status:approved os:IOS'), since the
 * Cloud Identity API's own reference docs don't spell out the syntax
 * themselves, just point at that shared field list.
 */
async function fetchDevicesById(cloudidentity: cloudidentity_v1.Cloudidentity, filter?: string) {
  const devicesById = new Map<string, DeviceInfo>();
  let pageToken: string | undefined;
  do {
    const res = await withRetry429(() =>
      cloudidentity.devices.list({
        customer: "customers/my_customer",
        pageSize: 100,
        pageToken,
        filter,
      }),
    );
    for (const device of res.data.devices || []) {
      const resourceId = deviceResourceId(device.name);
      if (!resourceId) continue;
      devicesById.set(resourceId, {
        // Prefer the explicit deviceId field for what we display/store —
        // it's the more human-meaningful identifier — falling back to the
        // resource ID only if Google omits it, which shouldn't happen but
        // costs nothing to guard.
        deviceId: device.deviceId ?? resourceId,
        deviceType: device.deviceType ?? null,
        model: device.model ?? null,
        osVersion: device.osVersion ?? null,
        lastSyncTime: device.lastSyncTime ? new Date(device.lastSyncTime) : null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return devicesById;
}

/**
 * Paginates devices.deviceUsers.list (parent: "devices/-" = search across
 * all devices) and joins each association against `devicesById`. Page size
 * caps at 20 here (vs. devices.list's 100), so this is the slower half of
 * a full org sweep — the per-user variant below passes `filter` to keep
 * both calls scoped instead of walking the whole org.
 */
async function fetchDeviceUserAssociations(
  cloudidentity: cloudidentity_v1.Cloudidentity,
  devicesById: Map<string, DeviceInfo>,
  filter?: string,
): Promise<NormalizedWorkspaceDevice[]> {
  const results: NormalizedWorkspaceDevice[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry429(() =>
      cloudidentity.devices.deviceUsers.list({
        parent: "devices/-",
        customer: "customers/my_customer",
        pageSize: 20,
        pageToken,
        filter,
      }),
    );
    for (const deviceUser of res.data.deviceUsers || []) {
      const resourceId = deviceResourceId(deviceUser.name);
      if (!deviceUser.userEmail || !resourceId) continue;
      const device = devicesById.get(resourceId);
      results.push({
        userEmail: deviceUser.userEmail,
        deviceId: device?.deviceId ?? resourceId,
        deviceType: device?.deviceType ?? null,
        model: device?.model ?? null,
        osVersion: device?.osVersion ?? null,
        managementState: deviceUser.managementState ?? null,
        lastSyncTime: device?.lastSyncTime ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return results;
}

/**
 * Cloud Identity Devices API, org-wide, two calls: devices.list gives
 * device attributes keyed by resource ID; devices.deviceUsers.list gives
 * the userEmail <-> device associations for every device. Slow on a large
 * org (deviceUsers.list's 20-per-page cap means many round trips) — this
 * is what the background cron uses; the UI should prefer
 * fetchWorkspaceDevicesForUser() for anything interactive.
 */
export async function fetchWorkspaceDevices(): Promise<NormalizedWorkspaceDevice[]> {
  const auth = getAuthClient();
  const cloudidentity = google.cloudidentity({ version: "v1", auth });

  const devicesById = await fetchDevicesById(cloudidentity);
  const results = await fetchDeviceUserAssociations(cloudidentity, devicesById);

  console.log(
    `[WorkspaceDevices] Fetched ${devicesById.size} devices, ${results.length} device/user associations, ${results.filter((r) => r.deviceType).length} joined successfully.`,
  );

  return results;
}

/**
 * Same shape as fetchWorkspaceDevices() but scoped to one user via the
 * "email:" filter on both calls — the fast path for anything interactive
 * (the Devices tab syncs a user's devices on-demand rather than eating the
 * cost of a full org sweep just to expand one row). The filter is a
 * partial/substring match per Google's docs (matches "joe.a@x.com" and
 * "joe.b@x.com" on a query for "joe"), so results are still filtered
 * client-side to an exact match rather than trusting the server-side
 * filter alone.
 */
export async function fetchWorkspaceDevicesForUser(userEmail: string): Promise<NormalizedWorkspaceDevice[]> {
  const auth = getAuthClient();
  const cloudidentity = google.cloudidentity({ version: "v1", auth });
  const filter = `email:${userEmail}`;

  const devicesById = await fetchDevicesById(cloudidentity, filter);
  const results = await fetchDeviceUserAssociations(cloudidentity, devicesById, filter);

  return results.filter((d) => d.userEmail.toLowerCase() === userEmail.toLowerCase());
}

async function upsertWorkspaceDevices(devices: NormalizedWorkspaceDevice[]): Promise<void> {
  for (const d of devices) {
    await prisma.workspaceDevice.upsert({
      where: { userEmail_deviceId: { userEmail: d.userEmail, deviceId: d.deviceId } },
      update: {
        deviceType: d.deviceType,
        model: d.model,
        osVersion: d.osVersion,
        managementState: d.managementState,
        lastSyncTime: d.lastSyncTime,
      },
      create: {
        userEmail: d.userEmail,
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        model: d.model,
        osVersion: d.osVersion,
        managementState: d.managementState,
        lastSyncTime: d.lastSyncTime,
      },
    });
  }
}

/**
 * Cron entry point: full org-wide upsert + delete-stale against
 * WorkspaceDevice, mirroring syncConnectedApps()'s snapshot pattern. Kept
 * as a background-only sweep (6h cron) — the Devices tab itself now uses
 * syncWorkspaceDevicesForUser() per account instead of forcing a full sync
 * on every page load, since the full sweep is meaningfully slower.
 */
export async function syncWorkspaceDevices(): Promise<void> {
  if (!isWorkspaceMonitoringConfigured()) return;

  try {
    const devices = await fetchWorkspaceDevices();
    await upsertWorkspaceDevices(devices);

    // Org-wide delete-stale, not per-user — safe because `devices` above
    // is a full org sweep every time, not a partial/filtered one.
    if (devices.length > 0) {
      await prisma.workspaceDevice.deleteMany({
        where: {
          NOT: {
            OR: devices.map((d) => ({ userEmail: d.userEmail, deviceId: d.deviceId })),
          },
        },
      });
    }

    console.log(`[WorkspaceDevices] Synced ${devices.length} device/user associations.`);
  } catch (error) {
    console.error("[WorkspaceDevices] Sync failed:", describeGoogleApiError(error));
  }
}

/**
 * On-demand per-user sync, mirroring syncConnectedAppsForUser() — used by
 * the Devices tab when an admin expands one account. Can throw; the route
 * decides how to surface that (500 to the caller), same convention as
 * syncConnectedAppsForUser.
 */
export async function syncWorkspaceDevicesForUser(userEmail: string) {
  const devices = await fetchWorkspaceDevicesForUser(userEmail);
  await upsertWorkspaceDevices(devices);

  await prisma.workspaceDevice.deleteMany({
    where: { userEmail, deviceId: { notIn: devices.map((d) => d.deviceId) } },
  });

  return prisma.workspaceDevice.findMany({ where: { userEmail }, orderBy: { deviceType: "asc" } });
}

export interface InferredDevice {
  deviceType: string | null;
  model: string | null;
  osVersion: string | null;
  gapMs: number;
}

// Best-effort, NOT authoritative: Google's Reports API login events carry
// no device reference at all (see the note on NormalizedActivityEvent) —
// there is no real link to draw here, only a guess. This finds the
// WorkspaceDevice with the closest lastSyncTime to a login's occurredAt,
// for the same user, on the theory that Endpoint Verification pings
// periodically while Chrome is open on the device actually being used.
// Endpoint Verification's sync interval isn't documented anywhere found,
// so MAX_INFERENCE_GAP_MS is a loose sanity bound to avoid surfacing a
// "match" to a device that hasn't synced in a long time — not a real fact
// about EV's cadence. The actual gap is always returned alongside the
// guess (gapMs) so the caller can judge credibility itself: "4 minutes
// apart" is trustworthy, "6 days apart, nothing closer available" is not,
// and both currently render as a "match" without this.
const MAX_INFERENCE_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export function inferLikelyDevice(
  occurredAt: Date,
  devices: { deviceType: string | null; model: string | null; osVersion: string | null; lastSyncTime: Date | null }[],
): InferredDevice | null {
  let best: InferredDevice | null = null;
  let bestGap = Infinity;
  for (const d of devices) {
    if (!d.lastSyncTime) continue;
    const gap = Math.abs(d.lastSyncTime.getTime() - occurredAt.getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = { deviceType: d.deviceType, model: d.model, osVersion: d.osVersion, gapMs: gap };
    }
  }
  return best && bestGap <= MAX_INFERENCE_GAP_MS ? best : null;
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
      (event) => !isOwnPollingNoise(event, ownClientId),
    );

    // Second fallback for events where Google's Reports API didn't supply
    // app_name (appName === the raw client_id): the Connected Apps sync
    // (syncConnectedApps(), Directory API tokens.list) sometimes already
    // has a friendlier displayText for the same client_id, since it's a
    // different Google endpoint with different data. One bulk lookup per
    // ingest run rather than a query per event.
    //
    // Isolated in its own try/catch deliberately: this is a cosmetic
    // upgrade (nicer app names), not essential to ingestion. It must never
    // be able to abort the loop below and block real event ingestion
    // (including login events, which have nothing to do with app names)
    // just because this one lookup had a bad moment.
    const unresolvedClientIds = [
      ...new Set(
        events
          .filter((e) => e.clientId && e.appName === e.clientId)
          .map((e) => e.clientId as string),
      ),
    ];
    let nameByClientId = new Map<string, string>();
    if (unresolvedClientIds.length) {
      try {
        const knownNames = await prisma.connectedApp.findMany({
          where: { clientId: { in: unresolvedClientIds }, appName: { not: null } },
          select: { clientId: true, appName: true },
        });
        nameByClientId = new Map(knownNames.map((a) => [a.clientId, a.appName as string]));
      } catch (error) {
        console.error("[WorkspaceActivity] ConnectedApp name lookup failed (non-fatal, continuing without it):", error);
      }
    }

    let flaggedCount = 0;

    for (const event of events) {
      if (!event.userEmail || await alreadyIngested(event)) continue;

      const resolvedAppName =
        event.clientId && event.appName === event.clientId
          ? nameByClientId.get(event.clientId) ?? event.appName
          : event.appName;

      const alert = await evaluateAlert({ ...event, appName: resolvedAppName });
      await prisma.workspaceActivityEvent.create({
        data: {
          userEmail: event.userEmail,
          eventType: event.eventType,
          appName: resolvedAppName,
          ipAddress: event.ipAddress,
          regionCode: event.regionCode,
          subdivisionCode: event.subdivisionCode,
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
