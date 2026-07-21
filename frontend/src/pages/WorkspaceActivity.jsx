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

export default function WorkspaceActivity() {
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Workspace Activity
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          Google Workspace logins and OAuth app grants ingested for
          OrkaVault users. Flagged rows also triggered an admin
          notification. Requires Workspace monitoring to be configured
          (see Settings &rarr; Alerts) — empty until then.
        </p>
      </div>

      <div className="mb-6 flex space-x-4 bg-white p-4 shadow rounded-lg border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
          <select
            value={filterEventType}
            onChange={(e) => setFilterEventType(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Types</option>
            {uniqueEventTypes.map((type) => (
              <option key={type} value={type}>{formatEventType(type)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All Users</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Flagged</label>
          <select
            value={filterFlagged}
            onChange={(e) => setFilterFlagged(e.target.value)}
            className="block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          >
            <option value="">All</option>
            <option value="true">Flagged only</option>
            <option value="false">Unflagged only</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => { setFilterEventType(""); setFilterUser(""); setFilterFlagged(""); }}
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
                Event Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                App
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Flagged
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                  No workspace activity found matching filters
                </td>
              </tr>
            ) : (
              filteredEvents.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div title={new Date(event.occurredAt).toLocaleString()}>
                      {format(new Date(event.occurredAt), "MMM d, yyyy, h:mm a")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-mono">
                      {formatEventType(event.eventType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.userEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {event.appName || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {event.ipAddress || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {event.flagged ? (
                      <span className="bg-red-100 text-brand-red px-2 py-1 rounded text-xs font-medium">
                        Flagged
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
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
