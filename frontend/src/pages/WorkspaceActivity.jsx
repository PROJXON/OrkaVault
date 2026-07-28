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
        Google Workspace logins and OAuth app grants ingested for
        OrkaVault users. Flagged rows also triggered an admin
        notification. Requires Workspace monitoring to be configured
        (see Settings &rarr; Alerts) — empty until then.
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

      {/* Mobile: one card per event instead of a wide table */}
      <div className="row-cards md:hidden">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No workspace activity found matching filters</div>
        ) : (
          filteredEvents.map((event) => (
            <div key={event.id} className="row-card">
              <div className="row-card-title">
                <span className="badge-pill font-mono">{formatEventType(event.eventType)}</span>
                {event.flagged && (
                  <span className="bg-red-100 text-brand-red px-2 py-1 rounded text-xs font-medium">Flagged</span>
                )}
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
                <span className="rcf-value">{event.appName || "-"}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">IP Address</span>
                <span className="rcf-value font-mono">{event.ipAddress || "-"}</span>
              </div>
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
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Event Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                App
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Flagged
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  Loading...
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  No workspace activity found matching filters
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50 dark:bg-[var(--bg-canvas)]">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    <div title={new Date(event.occurredAt).toLocaleString()}>
                      {format(new Date(event.occurredAt), "MMM d, yyyy, h:mm a")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-1 rounded text-xs font-mono">
                      {formatEventType(event.eventType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-[var(--text-primary)]">
                    {event.userEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {event.appName || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)] font-mono">
                    {event.ipAddress || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {event.flagged ? (
                      <span className="bg-red-100 text-brand-red px-2 py-1 rounded text-xs font-medium">
                        Flagged
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-[var(--text-tertiary)] text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

function ConnectedAppRow({ app }) {
  return (
    <div className="py-2 border-t border-gray-100 dark:border-[var(--border-subtle)] first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">
          {app.appName || app.clientId}
        </span>
        {app.nativeApp && (
          <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-0.5 rounded text-xs font-medium">
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
        Every active Workspace account and its currently connected
        third-party OAuth apps — a live snapshot, not an audit trail;
        shows apps connected before monitoring existed too, unlike the
        Activity Log tab. Synced from Google when this tab loads (this
        can take a moment on a larger org) and again every 6 hours in
        the background — click an account to view its apps, or Refresh
        inside it to re-sync just that one. Requires Workspace
        monitoring to be configured (see Settings &rarr; Alerts) — empty
        until then.
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

      {tab === "activity" ? <ActivityLogTab /> : <ConnectedAppsTab />}
    </div>
  );
}
