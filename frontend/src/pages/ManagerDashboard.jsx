import React, { useState, useEffect } from "react";
import { apiFetch } from "../App.jsx";
import PasswordTable from "../components/PasswordTable.jsx";
import RevealModal from "../components/RevealModal.jsx";

export default function ManagerDashboard({ user }) {
  const [passwords, setPasswords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [plaintext, setPlaintext] = useState("");
  const [newPw, setNewPw] = useState({
    title: "",
    url: "",
    username: "",
    plaintextPassword: "",
    folderName: "DevOps",
  });

  const load = async () => {
    const [pw, rq] = await Promise.all([
      apiFetch(user.email, "/passwords"),
      apiFetch(user.email, "/requests"),
    ]);
    setPasswords(pw);
    setRequests(rq);
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
      <h2 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Manager Dashboard</h2>
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          marginBottom: 24,
        }}
      >
        Approve access requests, manage credentials, and monitor password
        health.
      </p>

      {/* Pending approvals */}
      <section
        className="glass-panel"
        style={{
          padding: 20,
          marginBottom: 24,
          borderLeft:
            pending.length > 0 ? "3px solid var(--accent-amber)" : "none",
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
        {pending.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            All clear — no pending requests.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  padding: 14,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--accent-teal)",
                    marginBottom: 4,
                  }}
                >
                  <span>
                    👤 {r.requester?.firstName || "User"}{" "}
                    {r.requester?.lastName || ""}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <h4 style={{ fontSize: "0.95rem", marginBottom: 4 }}>
                  {r.password?.title}
                </h4>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                    marginBottom: 10,
                  }}
                >
                  "{r.reason}"
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "5px 14px", fontSize: "0.8rem" }}
                    onClick={() => handleApprove(r.id)}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "5px 14px", fontSize: "0.8rem" }}
                    onClick={() => handleReject(r.id)}
                  >
                    ✕ Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Credentials table */}
      <section
        className="glass-panel"
        style={{ padding: 20, marginBottom: 24 }}
      >
        <h3 style={{ fontSize: "1.1rem", marginBottom: 14 }}>
          🔑 Credential Index
        </h3>
        <PasswordTable
          passwords={passwords}
          onReveal={handleReveal}
          onRequestAccess={() => {}}
        />
      </section>

      {/* Add credential form */}
      <section className="glass-panel" style={{ padding: 20 }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: 12 }}>
          ➕ Encrypt & Store New Credential
        </h3>
        <form
          onSubmit={handleAdd}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
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
            placeholder="Login Username"
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
            onChange={(e) => setNewPw({ ...newPw, folderName: e.target.value })}
          >
            <option value="DevOps">DevOps</option>
            <option value="Finance">Finance</option>
            <option value="Marketing">Marketing</option>
          </select>
          <div style={{ gridColumn: "span 2" }}>
            <button type="submit" className="btn btn-primary">
              Encrypt & Save
            </button>
          </div>
        </form>
      </section>

      {plaintext && (
        <RevealModal plaintext={plaintext} onClose={() => setPlaintext("")} />
      )}
    </div>
  );
}
