import React, { useState, useEffect } from "react";
import { apiFetch } from "../App.jsx";
import PasswordTable from "../components/PasswordTable.jsx";
import RevealModal from "../components/RevealModal.jsx";

export default function HolderDashboard({ user }) {
  const [passwords, setPasswords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [plaintext, setPlaintext] = useState("");
  const [requesting, setRequesting] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [pw, rq] = await Promise.all([
        apiFetch(user.email, "/passwords"),
        apiFetch(user.email, "/requests"),
      ]);
      setPasswords(pw);
      setRequests(rq);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleReveal = async (pw) => {
    try {
      const { token } = await apiFetch(
        user.email,
        `/passwords/${pw.id}/reveal-token`,
        { method: "POST" },
      );
      const { plaintext: pt } = await apiFetch(
        user.email,
        `/passwords/${pw.id}/reveal?token=${token}`,
      );
      setPlaintext(pt);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(user.email, "/requests", {
        method: "POST",
        body: JSON.stringify({ passwordId: requesting.id, reason }),
      });
      setRequesting(null);
      setReason("");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <h2 style={{ fontSize: "1.4rem", marginBottom: 4 }}>My Vault</h2>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          marginBottom: 24,
        }}
      >
        Welcome, {user.firstName}. Request access or reveal credentials you've
        been granted.
      </p>

      {error && (
        <div
          style={{
            background: "rgba(244,63,94,0.1)",
            border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            color: "var(--accent-rose)",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      <section
        className="glass-panel"
        style={{ padding: 20, marginBottom: 24 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: "1.1rem" }}>🔑 Credential Index</h3>
          <span
            className="badge"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            {passwords.length} items
          </span>
        </div>
        <PasswordTable
          passwords={passwords}
          onReveal={handleReveal}
          onRequestAccess={(pw) => setRequesting(pw)}
        />
      </section>

      {/* Request history */}
      <section className="glass-panel" style={{ padding: 20 }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>
          ⏱️ Request History
        </h3>
        {requests.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            No requests submitted yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.04)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "0.9rem" }}>
                    {r.password?.title}
                  </strong>
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      margin: "2px 0 0",
                    }}
                  >
                    "{r.reason}"
                  </p>
                </div>
                <span
                  className={`badge ${r.status === "approved" ? "badge-granted" : r.status === "pending" ? "badge-pending" : "badge-locked"}`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Request modal */}
      {requesting && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            className="glass-panel"
            style={{ padding: 28, maxWidth: 460, width: "100%", margin: 16 }}
          >
            <h3 style={{ marginBottom: 6 }}>Request Access</h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                marginBottom: 16,
              }}
            >
              {requesting.title}
            </p>
            <form onSubmit={handleSubmitRequest}>
              <textarea
                className="input-field"
                required
                placeholder="Business justification…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ minHeight: 90, resize: "vertical", marginBottom: 16 }}
              />
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRequesting(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {plaintext && (
        <RevealModal plaintext={plaintext} onClose={() => setPlaintext("")} />
      )}
    </div>
  );
}
