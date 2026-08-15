import React, { useState } from "react";
import { X } from "lucide-react";
import api from "../lib/api";

export default function RequestModal({ isOpen, onClose, account, onSuccess, prefill }) {
  const [requestType, setRequestType] = useState("VIEW_90S");
  const [reason, setReason] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [location, setLocation] = useState("");
  const [internationalAccessRequested, setInternationalAccessRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (isOpen) {
      setRequestType(prefill?.requestType || "VIEW_90S");
      setReason(prefill?.reason || "");
      setDeviceName(prefill?.deviceName || "");
      setLocation(prefill?.location || "");
      setInternationalAccessRequested(prefill?.internationalAccessRequested || false);
      setError("");
    }
  }, [isOpen, prefill]);

  if (!isOpen || !account) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/requests", {
        accountId: account.id,
        requestType,
        reason,
        deviceName,
        location,
        internationalAccessRequested
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="grow">
            <div className="mt">Request Access</div>
            <div className="ms">{account.name} · {account.platformType}</div>
          </div>
          <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-b">
            {error && (
              <div className="p-3 text-sm rounded-sm" style={{ color: "var(--error-text)", background: "var(--error-subtle)", border: "1px solid var(--error-border)" }}>
                {error}
              </div>
            )}

            <div className="field">
              <span className="field-label">Access Duration</span>
              <select className="select" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                <option value="VIEW_90S">Single View (90 seconds)</option>
                <option value="TEMP_24H">Temporary (24 Hours)</option>
                <option value="ONGOING">Ongoing Assignment</option>
              </select>
            </div>

            <div className="field">
              <span className="field-label">Business Justification</span>
              <textarea
                className="textarea"
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need access to this credential?"
              />
            </div>

            <div className="field">
              <span className="field-label">Device Name</span>
              <input
                className="input"
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. MacBook Pro, iPhone 14"
              />
            </div>

            <div className="field">
              <span className="field-label">Location</span>
              <input
                className="input"
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. New York, NY"
              />
            </div>

            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={internationalAccessRequested}
                onChange={(e) => setInternationalAccessRequested(e.target.checked)}
                className="h-4 w-4 rounded-sm"
                style={{ accentColor: "var(--brand)" }}
              />
              Requires International Access
            </label>
          </div>

          <div className="modal-f">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  );
}
