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
        <h1 className="text-2xl font-bold text-gray-900">
          Immutable Audit Log
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          A comprehensive record of every security event and action taken in
          OrkaVault.
        </p>
      </div>

      <div className="mb-6 flex space-x-4 bg-white p-4 shadow rounded-lg border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Actions</option>
            {uniqueActions.map(action => (
                <option key={action} value={action}>{formatAction(action)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Actor</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Users</option>
            {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
             onClick={() => { setFilterAction(""); setFilterUser(""); setFilterDate(""); }}
             className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Target Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                IP Address
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  Loading...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
               <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No logs found matching filters
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div title={new Date(log.timestamp).toLocaleString()}>
                      {format(new Date(log.timestamp), "MMM d, yyyy, h:mm a")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-mono">
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.user?.name || "System"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.account?.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {log.ipAddress || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
