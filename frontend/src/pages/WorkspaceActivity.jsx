import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { format } from "date-fns";

const formatEventType = (eventType) => {
  if (!eventType) return "-";
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Google doesn't always supply a human-readable app_name for a grant (e.g.
// unverified/internal OAuth clients) — in that case the backend falls back
// to the raw client_id, which looks like "123-abc.apps.googleusercontent.com".
// Show that as a labeled, shortened value instead of the raw string so it
// doesn't read as unlabeled garbage.
const isRawClientId = (appName) => !!appName && /\.apps\.googleusercontent\.com$/.test(appName);
const formatAppName = (appName) => {
  if (!appName) return "-";
  if (!isRawClientId(appName)) return appName;
  const idPart = appName.split(".")[0];
  const shortId = idPart.length > 12 ? `${idPart.slice(0, 12)}…` : idPart;
  return `Unverified app (${shortId})`;
};

// deviceType values from the Cloud Identity Devices API (WorkspaceDevice —
// a per-user device inventory synced separately from the Activity Log; see
// the Devices tab below). Google's Reports API login events have no
// per-event device field at all — the "Likely Device" shown on login rows
// further down is a backend-computed guess (inferLikelyDevice(), closest
// WorkspaceDevice.lastSyncTime), not real per-event data from Google.
const DEVICE_TYPE_LABELS = {
  WINDOWS: "Windows",
  MAC_OS: "Mac",
  LINUX: "Linux",
  CHROME_OS: "Chrome OS",
  ANDROID: "Android",
  IOS: "iOS",
  GOOGLE_SYNC: "Google Sync",
  DEVICE_TYPE_UNSPECIFIED: "Unknown",
};
const formatDeviceType = (deviceType) => {
  if (!deviceType) return "-";
  return DEVICE_TYPE_LABELS[deviceType] || deviceType;
};

const MANAGEMENT_STATE_LABELS = {
  APPROVED: "Approved",
  BLOCKED: "Blocked",
  PENDING: "Pending approval",
  UNPROVISIONED: "Unprovisioned",
  WIPING: "Wiping",
  WIPED: "Wiped",
};
const formatManagementState = (state) => {
  if (!state) return "-";
  return MANAGEMENT_STATE_LABELS[state] || state;
};

// regionCode/subdivisionCode come from Google's networkInfo — approximate
// (IP-derived), only present when Google resolves it for that event.
const formatLocation = (regionCode, subdivisionCode) => {
  if (!regionCode) return "-";
  return subdivisionCode ? `${subdivisionCode}, ${regionCode}` : regionCode;
};

const formatGap = (gapMs) => {
  const mins = Math.round(gapMs / 60000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

// inferredDevice is a backend-computed guess (services/googleWorkspace.ts's
// inferLikelyDevice()) — the closest WorkspaceDevice.lastSyncTime for this
// user, not real per-event data from Google. Always show the gap alongside
// the guess so it reads as "closest available, N apart" rather than a
// confirmed fact.
const formatInferredDevice = (inferredDevice) => {
  if (!inferredDevice) return "-";
  const parts = [formatDeviceType(inferredDevice.deviceType)];
  if (inferredDevice.model) parts.push(inferredDevice.model);
  if (inferredDevice.osVersion) parts.push(inferredDevice.osVersion);
  return `${parts.join(" · ")} (±${formatGap(inferredDevice.gapMs)}, inferred)`;
};

function ActivityLogTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEventType, setFilterEventType] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterFlagged, setFilterFlagged] = useState("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data } = await api.get("/workspace-activity?limit=200");
        setEvents(data);
      } catch (e) {
        console.error("Failed to load workspace activity");
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const uniqueEventTypes = useMemo(
    () => [...new Set(events.map((e) => e.eventType).filter(Boolean))],
    [events],
  );
  const uniqueUsers = useMemo(
    () => [...new Set(events.map((e) => e.userEmail).filter(Boolean))],
    [events],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      let match = true;
      if (filterEventType && e.eventType !== filterEventType) match = false;
      if (filterUser && e.userEmail !== filterUser) match = false;
      if (filterFlagged && String(e.flagged) !== filterFlagged) match = false;
      return match;
    });
  }, [events, filterEventType, filterUser, filterFlagged]);

  return (
    <>
      <p className="mt-2 mb-6 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
        Google Workspace logins and OAuth app grants ingested for your organization.
      </p>

      <div className="mb-6 flex flex-wrap gap-4 bg-white dark:bg-[var(--bg-surface)] p-4 shadow rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Event Type</label>
          <select
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Types</option>
            {uniqueEventTypes.map((type) => (
              <option key={type} value={type}>{formatEventType(type)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">User</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Users</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Flagged</label>
          <select
            value={filterFlagged}
            onChange={(e) => setFilterFlagged(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All</option>
            <option value="true">Flagged only</option>
            <option value="false">Unflagged only</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => { setFilterEventType(""); setFilterUser(""); setFilterFlagged(""); }}
            className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none whitespace-nowrap"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Tile layout at every breakpoint — a table here kept forcing
          horizontal scroll once more columns were added (nowrap-ish
          columns add up wider than most viewports), so this is cards
          only, no table fallback. */}
      <div className="row-cards">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No workspace activity found matching filters</div>
        ) : (
          filteredEvents.map((event) => (
            <div key={event.id} className="row-card">
              <div className="row-card-title">
                <span className="badge-pill font-mono">{formatEventType(event.eventType)}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Timestamp</span>
                <span className="rcf-value" title={new Date(event.occurredAt).toLocaleString()}>
                  {format(new Date(event.occurredAt), "MMM d, yyyy, h:mm a")}
                </span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">User</span>
                <span className="rcf-value">{event.userEmail}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">App</span>
                <span className="rcf-value" title={isRawClientId(event.appName) ? event.appName : undefined}>
                  {formatAppName(event.appName)}
                </span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">IP Address</span>
                <span className="rcf-value font-mono">{event.ipAddress || "-"}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Location</span>
                <span className="rcf-value">{formatLocation(event.regionCode, event.subdivisionCode)}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Likely Device</span>
                <span
                  className="rcf-value"
                  title="Best-effort guess: closest Endpoint Verification sync time for this user's devices. Not confirmed by Google — logins only, since token grants often come from a third-party app's own server."
                >
                  {formatInferredDevice(event.inferredDevice)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ConnectedAppRow({ app }) {
  return (
    <div className="py-2 border-t border-gray-100 dark:border-[var(--border-subtle)] first:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] min-w-0 break-words">
          {app.appName || app.clientId}
        </span>
        {app.nativeApp && (
          <span className="shrink-0 bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-0.5 rounded text-xs font-medium">
            Native
          </span>
        )}
      </div>
      <div
        className="mt-1 text-xs text-gray-500 dark:text-[var(--text-tertiary)]"
        title={(app.scopes || []).join(", ")}
      >
        {(app.scopes || []).join(", ") || "No scopes reported"}
      </div>
      <div className="mt-1 text-xs text-gray-400 dark:text-[var(--text-tertiary)]">
        Last synced {format(new Date(app.lastSeenAt), "MMM d, yyyy, h:mm a")}
      </div>
    </div>
  );
}

function ConnectedAppsTab() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [expandedUser, setExpandedUser] = useState(null);
  const [appsByUser, setAppsByUser] = useState({});
  const [syncingUser, setSyncingUser] = useState(null);
  const [errorByUser, setErrorByUser] = useState({});

  useEffect(() => {
    const syncAllAndLoad = async () => {
      try {
        // Sync every account once on load so counts are accurate right
        // away (slower than a plain list, but means expanding any
        // account afterward is instant — no per-click network call).
        const { data: allApps } = await api.post("/workspace-activity/connected-apps/sync");
        const grouped = {};
        for (const app of allApps) {
          (grouped[app.userEmail] = grouped[app.userEmail] || []).push(app);
        }
        setAppsByUser(grouped);

        const { data: userList } = await api.get("/workspace-activity/connected-apps/users");
        setUsers(userList);
      } catch (e) {
        console.error("Failed to sync Workspace connected apps");
      } finally {
        setUsersLoading(false);
      }
    };
    syncAllAndLoad();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.userEmail.toLowerCase().includes(q));
  }, [users, filterText]);

  const syncUser = async (userEmail) => {
    setSyncingUser(userEmail);
    setErrorByUser((prev) => ({ ...prev, [userEmail]: null }));
    try {
      const { data } = await api.post(
        `/workspace-activity/connected-apps/sync/${encodeURIComponent(userEmail)}`,
      );
      setAppsByUser((prev) => ({ ...prev, [userEmail]: data }));
      setUsers((prev) =>
        prev.map((u) => (u.userEmail === userEmail ? { ...u, appCount: data.length } : u)),
      );
    } catch (e) {
      setErrorByUser((prev) => ({ ...prev, [userEmail]: "Failed to sync this account." }));
    } finally {
      setSyncingUser(null);
    }
  };

  const toggleUser = (userEmail) => {
    // Apps for every account were already fetched by the initial sync
    // above, so expanding just toggles — no network call needed unless
    // the admin explicitly clicks "Refresh" inside the expanded view.
    setExpandedUser((prev) => (prev === userEmail ? null : userEmail));
  };

  const renderDetail = (userEmail) => {
    if (syncingUser === userEmail) {
      return (
        <div className="text-sm text-center py-4 text-gray-500 dark:text-[var(--text-tertiary)]">
          Syncing...
        </div>
      );
    }
    if (errorByUser[userEmail]) {
      return (
        <div className="text-sm text-center py-4 text-brand-red">
          {errorByUser[userEmail]}{" "}
          <button onClick={() => syncUser(userEmail)} className="underline">
            Retry
          </button>
        </div>
      );
    }
    const apps = appsByUser[userEmail] || [];
    if (apps.length === 0) {
      return (
        <div className="text-sm text-center py-4 text-gray-500 dark:text-[var(--text-tertiary)]">
          No connected apps
        </div>
      );
    }
    return (
      <div>
        <div className="flex justify-end mb-1">
          <button
            onClick={() => syncUser(userEmail)}
            className="text-xs text-brand-blue hover:underline"
          >
            Refresh
          </button>
        </div>
        {apps.map((app) => (
          <ConnectedAppRow key={app.id} app={app} />
        ))}
      </div>
    );
  };

  return (
    <>
      <p className="mt-2 mb-6 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
        Every active Workspace account and its currently connected third-party apps.
      </p>

      <div className="mb-6 flex flex-wrap gap-4 bg-white dark:bg-[var(--bg-surface)] p-4 shadow rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Search Accounts</label>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by email..."
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setFilterText("")}
            className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Mobile: one card per account, expands in place on tap */}
      <div className="row-cards md:hidden">
        {usersLoading ? (
          <div className="text-sm text-center py-6 text-muted">Syncing all accounts...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No accounts found matching filters</div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.userEmail} className="row-card">
              <button type="button" onClick={() => toggleUser(u.userEmail)} className="w-full text-left">
                <div className="row-card-title">
                  <span className="badge-pill font-mono">{u.userEmail}</span>
                  <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-1 rounded text-xs font-medium">
                    {u.appCount} app{u.appCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
              {expandedUser === u.userEmail && <div className="mt-2">{renderDetail(u.userEmail)}</div>}
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-[var(--bg-surface)] shadow rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Known Apps
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {usersLoading ? (
              <tr>
                <td colSpan="2" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  Syncing all accounts...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="2" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  No accounts found matching filters
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <React.Fragment key={u.userEmail}>
                  <tr
                    onClick={() => toggleUser(u.userEmail)}
                    className="cursor-pointer hover:bg-gray-50 dark:bg-[var(--bg-canvas)]"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-[var(--text-primary)]">
                      <span
                        className="mr-2 inline-block transition-transform"
                        style={{ transform: expandedUser === u.userEmail ? "rotate(90deg)" : "none" }}
                      >
                        &rsaquo;
                      </span>
                      {u.userEmail}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-1 rounded text-xs font-medium">
                        {u.appCount} app{u.appCount === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                  {expandedUser === u.userEmail && (
                    <tr>
                      <td colSpan="2" className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)]">
                        {renderDetail(u.userEmail)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

function DeviceRow({ device }) {
  return (
    <div className="py-2 border-t border-gray-100 dark:border-[var(--border-subtle)] first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">
          {formatDeviceType(device.deviceType)}
        </span>
        <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-0.5 rounded text-xs font-medium">
          {formatManagementState(device.managementState)}
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
        {device.model || "Unknown model"}{device.osVersion ? ` — ${device.osVersion}` : ""}
      </div>
      <div className="mt-1 text-xs text-gray-400 dark:text-[var(--text-tertiary)]">
        {device.lastSyncTime
          ? `Last synced ${format(new Date(device.lastSyncTime), "MMM d, yyyy, h:mm a")}`
          : "Last synced -"}
      </div>
    </div>
  );
}

function DevicesTab() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [expandedUser, setExpandedUser] = useState(null);
  const [devicesByUser, setDevicesByUser] = useState({});
  const [syncingUser, setSyncingUser] = useState(null);
  const [errorByUser, setErrorByUser] = useState({});

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await api.get("/workspace-activity/devices/users");
        setUsers(data);
      } catch (e) {
        console.error("Failed to load Workspace accounts");
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.userEmail.toLowerCase().includes(q));
  }, [users, filterText]);

  const syncUser = async (userEmail) => {
    setSyncingUser(userEmail);
    setErrorByUser((prev) => ({ ...prev, [userEmail]: null }));
    try {
      const { data } = await api.post(
        `/workspace-activity/devices/sync/${encodeURIComponent(userEmail)}`,
      );
      setDevicesByUser((prev) => ({ ...prev, [userEmail]: data }));
      setUsers((prev) =>
        prev.map((u) => (u.userEmail === userEmail ? { ...u, deviceCount: data.length } : u)),
      );
    } catch (e) {
      setErrorByUser((prev) => ({ ...prev, [userEmail]: "Failed to sync this account." }));
    } finally {
      setSyncingUser(null);
    }
  };

  const toggleUser = (userEmail) => {
    const collapsing = expandedUser === userEmail;
    setExpandedUser(collapsing ? null : userEmail);
    // Only sync the first time an account is expanded this session — a
    // per-account Cloud Identity query, not the slow full-org sweep.
    // Re-expanding afterward is instant; use the account's own "Refresh"
    // to force a re-sync.
    if (!collapsing && !devicesByUser[userEmail]) syncUser(userEmail);
  };

  const renderDetail = (userEmail) => {
    if (syncingUser === userEmail) {
      return (
        <div className="text-sm text-center py-4 text-gray-500 dark:text-[var(--text-tertiary)]">
          Syncing...
        </div>
      );
    }
    if (errorByUser[userEmail]) {
      return (
        <div className="text-sm text-center py-4 text-brand-red">
          {errorByUser[userEmail]}{" "}
          <button onClick={() => syncUser(userEmail)} className="underline">
            Retry
          </button>
        </div>
      );
    }
    const devices = devicesByUser[userEmail] || [];
    if (devices.length === 0) {
      return (
        <div className="text-sm text-center py-4 text-gray-500 dark:text-[var(--text-tertiary)]">
          No devices found
        </div>
      );
    }
    return (
      <div>
        <div className="flex justify-end mb-1">
          <button
            onClick={() => syncUser(userEmail)}
            className="text-xs text-brand-blue hover:underline"
          >
            Refresh
          </button>
        </div>
        {devices.map((device) => (
          <DeviceRow key={device.id} device={device} />
        ))}
      </div>
    );
  };

  return (
    <>
      <p className="mt-2 mb-6 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
        Devices associated with each Workspace account, synced from Google.
      </p>

      <div className="mb-6 flex flex-wrap gap-4 bg-white dark:bg-[var(--bg-surface)] p-4 shadow rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Search Accounts</label>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by email..."
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setFilterText("")}
            className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="row-cards">
        {usersLoading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No accounts found matching filters</div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.userEmail} className="row-card">
              <button type="button" onClick={() => toggleUser(u.userEmail)} className="w-full text-left">
                <div className="row-card-title">
                  <span className="badge-pill font-mono">{u.userEmail}</span>
                  <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-1 rounded text-xs font-medium">
                    {u.deviceCount} device{u.deviceCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
              {expandedUser === u.userEmail && <div className="mt-2">{renderDetail(u.userEmail)}</div>}
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default function WorkspaceActivity() {
  const [tab, setTab] = useState("activity");

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">
          Workspace Activity
        </h1>
      </div>

      <div className="border-b border-gray-200 dark:border-[var(--border-subtle)] mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: "activity", label: "Activity Log" },
            { key: "connected-apps", label: "Connected Apps" },
            { key: "devices", label: "Devices" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                tab === t.key
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-gray-500 dark:text-[var(--text-tertiary)] hover:text-gray-700 dark:text-[var(--text-secondary)] hover:border-gray-300 dark:border-[var(--border-default)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "activity" ? (
        <ActivityLogTab />
      ) : tab === "connected-apps" ? (
        <ConnectedAppsTab />
      ) : (
        <DevicesTab />
      )}
    </div>
  );
}
