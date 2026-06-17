import React, { useState, useEffect } from "react";
import { apiFetch } from "../App.jsx";
import PasswordTable from "../components/PasswordTable.jsx";
import RevealModal from "../components/RevealModal.jsx";

export default function AdminDashboard({ user }) {
  const [passwords, setPasswords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [system, setSystem] = useState(null);
  const [plaintext, setPlaintext] = useState("");
  const [newPw, setNewPw] = useState({
    title: "",
    url: "",
    username: "",
    plaintextPassword: "",
    folderName: "DevOps",
  });

  const load = async () => {
    const [pw, rq, u, lg, sys] = await Promise.all([
      apiFetch(user.email, "/passwords"),
      apiFetch(user.email, "/requests"),
      apiFetch(user.email, "/users"),
      apiFetch(user.email, "/audit-logs"),
      apiFetch(user.email, "/system/status"),
    ]);
    setPasswords(pw);
    setRequests(rq);
    setUsers(u);
    setLogs(lg);
    setSystem(sys);
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

  const handleApprove = async (id) => {
    await apiFetch(user.email, `/requests/${id}/approve`, { method: "POST" });
    load();
  };
  const handleReject = async (id) => {
    await apiFetch(user.email, `/requests/${id}/reject`, { method: "POST" });
    load();
  };
  const handleDeactivate = async (id) => {
    await apiFetch(user.email, `/users/${id}/deactivate`, { method: "POST" });
    load();
  };
  const handleSync = async () => {
    const r = await apiFetch(user.email, "/system/sync", { method: "POST" });
    alert(r.message);
    load();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    await apiFetch(user.email, "/passwords", {
      method: "POST",
      body: JSON.stringify(newPw),
    });
    setNewPw({
      title: "",
      url: "",
      username: "",
      plaintextPassword: "",
      folderName: "DevOps",
    });
    load();
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <h2 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Admin Console</h2>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          marginBottom: 24,
        }}
      >
        Full system visibility — users, credentials, approvals, audit trail, and
        infrastructure health.
      </p>

      {/* Top stats row */}
      {system && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {[
            {
              label: "KMS Engine",
              value: system.kmsStatus,
              color: "var(--accent-emerald)",
            },
            {
              label: "Redis JTI Store",
              value: system.redisStatus.includes("CONNECTED")
                ? "CONNECTED"
                : "IN-MEMORY",
              color: system.redisStatus.includes("CONNECTED")
                ? "var(--accent-emerald)"
                : "var(--accent-amber)",
            },
            {
              label: "Users",
              value: system.metrics?.userCount,
              color: "var(--accent-teal)",
            },
            {
              label: "Active Grants",
              value: system.metrics?.activeGrants,
              color: "var(--accent-violet)",
            },
          ].map((s, i) => (
            <div
              key={i}
              className="glass-panel"
              style={{ padding: "16px 20px" }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: s.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending approvals */}
      {pending.length > 0 && (
        <section
          className="glass-panel"
          style={{
            padding: 20,
            marginBottom: 24,
            borderLeft: "3px solid var(--accent-amber)",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              marginBottom: 12,
              color: "var(--accent-amber)",
            }}
          >
            🔔 Pending Approvals ({pending.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  padding: 14,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <span
                    style={{ fontSize: "0.8rem", color: "var(--accent-teal)" }}
                  >
                    👤 {r.requester?.firstName} —{" "}
                  </span>
                  <strong>{r.password?.title}</strong>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "4px 12px", fontSize: "0.78rem" }}
                    onClick={() => handleApprove(r.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "4px 12px", fontSize: "0.78rem" }}
                    onClick={() => handleReject(r.id)}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Credential table */}
      <section
        className="glass-panel"
        style={{ padding: 20, marginBottom: 24 }}
      >
        <h3 style={{ fontSize: "1.1rem", marginBottom: 14 }}>
          🔑 All Credentials
        </h3>
        <PasswordTable
          passwords={passwords}
          onReveal={handleReveal}
          onRequestAccess={() => {}}
        />
      </section>

      {/* Two-column: Users + Add credential */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* User directory */}
        <section className="glass-panel" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <h3 style={{ fontSize: "1.1rem" }}>👥 Workspace Directory</h3>
            <button
              className="btn btn-secondary"
              style={{ padding: "5px 10px", fontSize: "0.75rem" }}
              onClick={handleSync}
            >
              🔄 Sync
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.02)",
                  padding: "10px 12px",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {u.firstName} {u.lastName}
                  </div>
                  <div
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    {u.email}
                  </div>
                  <span
                    className="badge badge-role"
                    style={{
                      fontSize: "0.6rem",
                      padding: "2px 6px",
                      marginTop: 2,
                    }}
                  >
                    {u.role}
                  </span>
                </div>
                {u.status === "active" ? (
                  <button
                    className="btn btn-danger"
                    style={{ padding: "4px 8px", fontSize: "0.7rem" }}
                    onClick={() => handleDeactivate(u.id)}
                  >
                    Deactivate
                  </button>
                ) : (
                  <span
                    className="badge badge-locked"
                    style={{ fontSize: "0.65rem" }}
                  >
                    SUSPENDED
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Add credential */}
        <section className="glass-panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>
            ➕ Add Credential
          </h3>
          <form
            onSubmit={handleAdd}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <input
              className="input-field"
              required
              placeholder="Resource Title"
              value={newPw.title}
              onChange={(e) => setNewPw({ ...newPw, title: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Username"
              value={newPw.username}
              onChange={(e) => setNewPw({ ...newPw, username: e.target.value })}
            />
            <input
              className="input-field"
              type="password"
              required
              placeholder="Secret Value"
              value={newPw.plaintextPassword}
              onChange={(e) =>
                setNewPw({ ...newPw, plaintextPassword: e.target.value })
              }
            />
            <select
              className="input-field"
              value={newPw.folderName}
              onChange={(e) =>
                setNewPw({ ...newPw, folderName: e.target.value })
              }
            >
              <option value="DevOps">DevOps</option>
              <option value="Finance">Finance</option>
              <option value="Marketing">Marketing</option>
            </select>
            <button type="submit" className="btn btn-primary">
              Encrypt & Save
            </button>
          </form>
        </section>
      </div>

      {/* Audit logs */}
      <section className="glass-panel" style={{ padding: 20 }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>
          📜 Security Audit Trail
        </h3>
        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {logs.map((l) => (
            <div
              key={l.id}
              style={{
                fontSize: "0.78rem",
                padding: "6px 10px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.01)",
                borderLeft: `2px solid ${l.status === "success" ? "var(--accent-emerald)" : "var(--accent-rose)"}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                className="font-mono"
                style={{ color: "var(--text-muted)", minWidth: 80 }}
              >
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ fontWeight: 600, flex: 1 }}>{l.action}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {l.user?.email || "system"}
              </span>
              <span
                className="font-mono"
                style={{
                  color:
                    l.status === "success"
                      ? "var(--accent-emerald)"
                      : "var(--accent-rose)",
                }}
              >
                {l.status}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No audit events yet.
            </p>
          )}
        </div>
      </section>

      {plaintext && (
        <RevealModal plaintext={plaintext} onClose={() => setPlaintext("")} />
      )}
    </div>
  );
}
