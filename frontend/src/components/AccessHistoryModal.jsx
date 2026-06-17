import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import api from "../lib/api";
import { format } from "date-fns";

const formatAction = (action) => {
  if (!action) return "-";
  return action
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

export default function AccessHistoryModal({ isOpen, onClose, accountId, accountName }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && accountId) {
      setLoading(true);
      api.get(`/audit?accountId=${accountId}&limit=50`)
        .then(({ data }) => setLogs(data))
        .catch(err => console.error("Failed to load history", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, accountId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />
        <div className="relative inline-block w-full max-w-2xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
          <div className="flex justify-between items-center mb-5 border-b pb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Access History: {accountName}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 max-h-96 overflow-y-auto custom-scrollbar">
            {loading ? (
              <p className="text-sm text-gray-500 text-center py-4">Loading history...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No access history found.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <li key={log.id} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{log.user?.name || "System"}</span>
                      <span className="text-gray-500 mx-2">performed</span>
                      <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs font-mono">
                        {formatAction(log.action)}
                      </span>
                    </div>
                    <div className="text-gray-500 text-right">
                      <div title={new Date(log.timestamp).toLocaleString()}>
                         {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                      </div>
                      <div className="text-xs font-mono">{log.ipAddress || "Unknown IP"}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="mt-5 pt-4 border-t sm:flex sm:flex-row-reverse">
             <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
              >
                Close
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}
