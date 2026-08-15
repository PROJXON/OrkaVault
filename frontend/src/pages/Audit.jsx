import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { format } from "date-fns";

const formatAction = (action) => {
  if (!action) return "-";
  return action
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data } = await api.get("/audit?limit=200");
        setLogs(data);
      } catch (e) {
        console.error("Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const uniqueActions = useMemo(() => [...new Set(logs.map((l) => l.action).filter(Boolean))], [logs]);
  const uniqueUsers = useMemo(() => [...new Set(logs.map((l) => l.user?.name).filter(Boolean))], [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      let match = true;
      if (filterAction && log.action !== filterAction) match = false;
      if (filterUser && log.user?.name !== filterUser) match = false;
      if (filterDate) {
        const logDateStr = new Date(log.timestamp).toISOString().split("T")[0];
        if (logDateStr !== filterDate) match = false;
      }
      return match;
    });
  }, [logs, filterAction, filterUser, filterDate]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">
          Immutable Audit Log
        </h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
          A comprehensive record of every security event and action taken in
          OrkaVault.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4 bg-white dark:bg-[var(--bg-surface)] p-4 shadow-sm rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Actions</option>
            {uniqueActions.map(action => (
                <option key={action} value={action}>{formatAction(action)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Actor</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Users</option>
            {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
             onClick={() => { setFilterAction(""); setFilterUser(""); setFilterDate(""); }}
             className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-xs text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-hidden whitespace-nowrap"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Mobile: one card per log entry instead of a wide table */}
      <div className="row-cards md:hidden">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No logs found matching filters</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="row-card">
              <div className="row-card-title">
                <span className="badge-pill font-mono">{formatAction(log.action)}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Timestamp</span>
                <span className="rcf-value" title={new Date(log.timestamp).toLocaleString()}>
                  {format(new Date(log.timestamp), "MMM d, yyyy, h:mm a")}
                </span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Actor</span>
                <span className="rcf-value">{log.user?.name || "System"}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Department</span>
                <span className="rcf-value">{log.user?.department || "-"}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Target Account</span>
                <span className="rcf-value">{log.account?.name || "-"}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">IP Address</span>
                <span className="rcf-value font-mono">{log.ipAddress || "-"}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Actor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Target Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {loading ? (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  Loading...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
               <tr>
                <td
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  No logs found matching filters
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:bg-[var(--bg-canvas)]">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    <div title={new Date(log.timestamp).toLocaleString()}>
                      {format(new Date(log.timestamp), "MMM d, yyyy, h:mm a")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-800 dark:text-[var(--text-primary)] px-2 py-1 rounded-sm text-xs font-mono">
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-[var(--text-primary)]">
                    {log.user?.name || "System"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {log.user?.department || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {log.account?.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)] font-mono">
                    {log.ipAddress || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
