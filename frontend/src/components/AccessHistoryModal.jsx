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
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="mt grow">Access History: {accountName}</div>
          <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-b">
          <div className="max-h-96 overflow-y-auto scroll-area">
            {loading ? (
              <p className="text-sm text-muted text-center py-4">Loading history...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No access history found.</p>
            ) : (
              <ul>
                {logs.map((log) => (
                  <li key={log.id} className="py-3 flex justify-between items-center text-sm" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <div>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{log.user?.name || "System"}</span>
                      <span className="text-muted mx-2">performed</span>
                      <span className="badge-pill font-mono">{formatAction(log.action)}</span>
                    </div>
                    <div className="text-right text-muted">
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
        </div>

        <div className="modal-f">
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
