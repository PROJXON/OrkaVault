import React from "react";

export default function PasswordTable({
  passwords,
  onReveal,
  onRequestAccess,
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
            }}
          >
            <th style={{ padding: "12px 8px" }}>Resource</th>
            <th style={{ padding: "12px 8px" }}>Category</th>
            <th style={{ padding: "12px 8px" }}>Username</th>
            <th style={{ padding: "12px 8px" }}>Health</th>
            <th style={{ padding: "12px 8px" }}>Access</th>
            <th style={{ padding: "12px 8px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {passwords.map((pw) => (
            <tr
              key={pw.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <td style={{ padding: "12px 8px", fontWeight: 500 }}>
                {pw.title}
              </td>
              <td style={{ padding: "12px 8px" }}>
                <span
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {pw.folderName}
                </span>
              </td>
              <td
                style={{
                  padding: "12px 8px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.85rem",
                }}
              >
                {pw.username || "—"}
              </td>
              <td style={{ padding: "12px 8px" }}>
                <span
                  style={{
                    color:
                      pw.healthScore > 80
                        ? "var(--accent-emerald)"
                        : pw.healthScore > 50
                          ? "var(--accent-amber)"
                          : "var(--accent-rose)",
                    fontWeight: 600,
                  }}
                >
                  {pw.healthScore}%
                </span>
              </td>
              <td style={{ padding: "12px 8px" }}>
                <span
                  className={`badge ${pw.accessStatus === "granted" ? "badge-granted" : pw.accessStatus === "pending" ? "badge-pending" : "badge-locked"}`}
                >
                  {pw.accessStatus}
                </span>
              </td>
              <td style={{ padding: "12px 8px" }}>
                {pw.accessStatus === "granted" ? (
                  <button
                    className="btn btn-primary"
                    style={{ padding: "5px 12px", fontSize: "0.8rem" }}
                    onClick={() => onReveal(pw)}
                  >
                    👁️ Reveal
                  </button>
                ) : pw.accessStatus === "pending" ? (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "5px 12px", fontSize: "0.8rem" }}
                    disabled
                  >
                    ⏳ Pending
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{
                      padding: "5px 12px",
                      fontSize: "0.8rem",
                      borderColor: "var(--accent-teal)",
                    }}
                    onClick={() => onRequestAccess(pw)}
                  >
                    🔑 Request
                  </button>
                )}
              </td>
            </tr>
          ))}
          {passwords.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                No credentials found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
