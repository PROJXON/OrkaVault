import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { Trash2, Edit2, X, Check, Plus } from "lucide-react";

function PoliciesTab() {
  const [settings, setSettings] = useState({
    MIN_HEALTH_SCORE: "40",
    ROTATION_WARNING_DAYS: "7",
    OFFBOARDING_ALERT_DAYS: "30",
    REQUIRE_TOTP_QR: "true"
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await api.get("/policies");
        const newSettings = { ...settings };
        data.forEach(p => {
          if (p.value !== null && p.value !== undefined) {
             newSettings[p.name] = p.value;
          }
        });
        setSettings(newSettings);
      } catch (e) {
        console.error("Failed to fetch policies");
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage("");
    try {
      await api.post("/policies/bulk", {
        policies: [
          { name: "MIN_HEALTH_SCORE", value: settings.MIN_HEALTH_SCORE, type: "SYSTEM" },
          { name: "ROTATION_WARNING_DAYS", value: settings.ROTATION_WARNING_DAYS, type: "SYSTEM" },
          { name: "OFFBOARDING_ALERT_DAYS", value: settings.OFFBOARDING_ALERT_DAYS, type: "SYSTEM" },
          { name: "REQUIRE_TOTP_QR", value: settings.REQUIRE_TOTP_QR, type: "SECURITY" },
        ]
      });
      setMessage("Settings saved successfully.");
    } catch (e) {
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)] flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">
          Security Policies
        </h3>
        {message && (
          <span className={`text-sm ${message.includes("success") ? "text-brand-green" : "text-brand-red"}`}>
            {message}
          </span>
        )}
      </div>
      <div className="px-6 py-5 space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Minimum Password Health Score
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Passwords scoring below this threshold will trigger alerts to the
            owner and admins.
          </p>
          <input
            type="number"
            value={settings.MIN_HEALTH_SCORE}
            onChange={(e) => setSettings({ ...settings, MIN_HEALTH_SCORE: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Rotation Warning Window (Days)
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            How many days before a password rotation is due should alerts
            begin?
          </p>
          <input
            type="number"
            value={settings.ROTATION_WARNING_DAYS}
            onChange={(e) => setSettings({ ...settings, ROTATION_WARNING_DAYS: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Offboarding Alert Window (Days)
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Alert admins when a user's set end date falls within this window.
          </p>
          <input
            type="number"
            value={settings.OFFBOARDING_ALERT_DAYS}
            onChange={(e) => setSettings({ ...settings, OFFBOARDING_ALERT_DAYS: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div className="flex items-start justify-between">
          <div className="pr-6">
            <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
              Require Authenticator QR Code for Google Workspace
            </label>
            <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
              When enabled, adding or editing a Google Workspace entry
              requires a TOTP QR code. Bulk CSV import always skips this
              requirement (a QR image can't be embedded in a CSV row) and
              flags imported entries for a follow-up upload regardless of
              this setting.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.REQUIRE_TOTP_QR !== "false"}
            onClick={() =>
              setSettings({
                ...settings,
                REQUIRE_TOTP_QR: settings.REQUIRE_TOTP_QR === "false" ? "true" : "false",
              })
            }
            className={`relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue ${
              settings.REQUIRE_TOTP_QR !== "false" ? "bg-brand-blue" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white dark:bg-[var(--bg-surface)] shadow-sm transform transition-transform ${
                settings.REQUIRE_TOTP_QR !== "false" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)] flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Policies"}
        </button>
      </div>
    </div>
  );
}

function AlertsTab() {
  const [urls, setUrls] = useState({
    DISCORD_WEBHOOK_URL: "",
    GCHAT_WEBHOOK_URL: "",
    WORKSPACE_ALLOWED_IPS: "",
    WORKSPACE_ALLOWED_COUNTRIES: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await api.get("/policies");
        const newUrls = { ...urls };
        data.forEach((p) => {
          if (p.name in newUrls && p.value) {
            newUrls[p.name] = p.value;
          }
        });
        setUrls(newUrls);
      } catch (e) {
        console.error("Failed to fetch policies");
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage("");
    try {
      await api.post("/policies/bulk", {
        policies: [
          { name: "DISCORD_WEBHOOK_URL", value: urls.DISCORD_WEBHOOK_URL, type: "ALERTS" },
          { name: "GCHAT_WEBHOOK_URL", value: urls.GCHAT_WEBHOOK_URL, type: "ALERTS" },
          { name: "WORKSPACE_ALLOWED_IPS", value: urls.WORKSPACE_ALLOWED_IPS, type: "ALERTS" },
          { name: "WORKSPACE_ALLOWED_COUNTRIES", value: urls.WORKSPACE_ALLOWED_COUNTRIES, type: "ALERTS" },
        ],
      });
      setMessage("Settings saved successfully.");
    } catch (e) {
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)] flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">
          Chat Alerts
        </h3>
        {message && (
          <span className={`text-sm ${message.includes("success") ? "text-brand-green" : "text-brand-red"}`}>
            {message}
          </span>
        )}
      </div>
      <div className="px-6 py-5 space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Discord Webhook URL
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Access-request activity (new/approved/denied) will be posted to
            this channel. Create one via Channel Settings &rarr;
            Integrations &rarr; Webhooks in Discord. Leave blank to disable.
          </p>
          <input
            type="text"
            placeholder="https://discord.com/api/webhooks/..."
            value={urls.DISCORD_WEBHOOK_URL}
            onChange={(e) => setUrls({ ...urls, DISCORD_WEBHOOK_URL: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Google Chat Webhook URL
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Same events, posted to a Google Chat space. Create one via
            Space &rarr; Apps &amp; integrations &rarr; Webhooks. Leave
            blank to disable.
          </p>
          <input
            type="text"
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            value={urls.GCHAT_WEBHOOK_URL}
            onChange={(e) => setUrls({ ...urls, GCHAT_WEBHOOK_URL: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Workspace Login Allow-List (IPs)
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Comma-separated IP addresses/prefixes. Workspace logins from
            outside this list trigger an alert (Phase 2, Workspace
            monitoring). Leave blank to disable this check.
          </p>
          <input
            type="text"
            placeholder="203.0.113.4, 198.51.100.0"
            value={urls.WORKSPACE_ALLOWED_IPS}
            onChange={(e) => setUrls({ ...urls, WORKSPACE_ALLOWED_IPS: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
            Workspace Login Allow-List (Countries)
          </label>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
            Comma-separated ISO country codes. Best-effort: only checked
            when Google's event includes a country field. Leave blank to
            disable this check.
          </p>
          <input
            type="text"
            placeholder="US, CA"
            value={urls.WORKSPACE_ALLOWED_COUNTRIES}
            onChange={(e) => setUrls({ ...urls, WORKSPACE_ALLOWED_COUNTRIES: e.target.value })}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)] text-right">
        <button
          onClick={handleSave}
          disabled={loading}
          className="inline-flex items-center bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Alerts"}
        </button>
      </div>
    </div>
  );
}

function BackupsTab() {
  const [settings, setSettings] = useState({
    AUDIT_LOG_RETENTION_DAYS: "",
    MAX_AUDIT_BACKUPS: "10",
  });
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  const fetchAll = async () => {
    try {
      const [{ data: policies }, { data: backupList }] = await Promise.all([
        api.get("/policies"),
        api.get("/backups"),
      ]);
      const newSettings = { ...settings };
      policies.forEach((p) => {
        if (p.name in newSettings && p.value !== null && p.value !== undefined) {
          newSettings[p.name] = p.value;
        }
      });
      setSettings(newSettings);
      setBackups(backupList);
    } catch (e) {
      console.error("Failed to load backup settings");
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setMessage("");
    try {
      await api.post("/policies/bulk", {
        policies: [
          { name: "AUDIT_LOG_RETENTION_DAYS", value: settings.AUDIT_LOG_RETENTION_DAYS, type: "SYSTEM" },
          { name: "MAX_AUDIT_BACKUPS", value: settings.MAX_AUDIT_BACKUPS, type: "SYSTEM" },
        ],
      });
      setMessage("Settings saved successfully.");
    } catch (e) {
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    setMessage("");
    try {
      const { data } = await api.post("/backups/run");
      setMessage(data.message);
      await fetchAll();
    } catch (e) {
      setMessage(e.response?.data?.error || "Failed to run backup sweep.");
    } finally {
      setRunning(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)] flex justify-between items-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">
            Audit Log Retention
          </h3>
          {message && (
            <span className={`text-sm ${message.toLowerCase().includes("fail") ? "text-brand-red" : "text-brand-green"}`}>
              {message}
            </span>
          )}
        </div>
        <div className="px-6 py-5 space-y-6">
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
              Retention Window (Days)
            </label>
            <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
              Audit log entries older than this are backed up to a CSV file below and removed from the
              database. Leave blank to keep audit logs indefinitely (no automatic backup/purge).
            </p>
            <input
              type="number"
              min="1"
              placeholder="e.g. 365"
              value={settings.AUDIT_LOG_RETENTION_DAYS}
              onChange={(e) => setSettings({ ...settings, AUDIT_LOG_RETENTION_DAYS: e.target.value })}
              className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
            />
          </div>

          <hr className="border-gray-200 dark:border-[var(--border-subtle)]" />

          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
              Max Backups Kept
            </label>
            <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-3">
              Once this many CSV backups exist, the oldest are deleted after each sweep.
            </p>
            <input
              type="number"
              min="1"
              value={settings.MAX_AUDIT_BACKUPS}
              onChange={(e) => setSettings({ ...settings, MAX_AUDIT_BACKUPS: e.target.value })}
              className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)] flex justify-between items-center">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="text-sm font-medium text-brand-blue hover:text-blue-700 disabled:opacity-50"
          >
            {running ? "Running..." : "Run Backup Now"}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
        <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)]">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">Backups</h3>
        </div>
        <ul className="divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          {backups.length === 0 ? (
            <li className="px-6 py-4 text-sm text-gray-500 dark:text-[var(--text-tertiary)] italic">
              No backups yet.
            </li>
          ) : (
            backups.map((b) => (
              <li key={b.filename} className="px-6 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-900 dark:text-[var(--text-primary)] font-mono">{b.filename}</div>
                  <div className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                    {new Date(b.createdAt).toLocaleString()} · {formatBytes(b.sizeBytes)}
                  </div>
                </div>
                <a
                  href={`${api.defaults.baseURL}/backups/${b.filename}`}
                  onClick={(e) => {
                    e.preventDefault();
                    api.get(`/backups/${b.filename}`, { responseType: "blob" }).then(({ data }) => {
                      const url = window.URL.createObjectURL(data);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = b.filename;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    });
                  }}
                  className="text-sm text-brand-blue hover:text-blue-700 font-medium"
                >
                  Download
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}

function DepartmentsTab() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [deletingDept, setDeletingDept] = useState(null);
  const [confirmText, setConfirmText] = useState("");

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get("/departments");
      setDepartments(data);
    } catch (e) {
      setError("Failed to load departments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    try {
      await api.post("/departments", { name: newName.trim() });
      setNewName("");
      await fetchDepartments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to add department.");
    }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setEditingName(d.name);
    setError("");
  };

  const handleRename = async (id) => {
    if (!editingName.trim()) return;
    setError("");
    try {
      await api.patch(`/departments/${id}`, { name: editingName.trim() });
      setEditingId(null);
      await fetchDepartments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to rename department.");
    }
  };

  const handleDelete = (d) => {
    setDeletingDept(d);
    setConfirmText("");
  };

  const confirmDelete = async () => {
    if (!deletingDept) return;
    if (deletingDept.userCount > 0 && confirmText !== "Yes") return;
    setError("");
    try {
      await api.delete(`/departments/${deletingDept.id}`);
      setDeletingDept(null);
      setConfirmText("");
      await fetchDepartments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to delete department.");
    }
  };

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)]">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">
          Departments
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
          Configure the department list users can be assigned to (Profile,
          Registration, and Users &amp; Roles all pull from this list).
        </p>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm text-brand-red">{error}</p>
        </div>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
        {loading ? (
          <li className="px-6 py-4 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading...</li>
        ) : departments.length === 0 ? (
          <li className="px-6 py-4 text-sm text-gray-500 dark:text-[var(--text-tertiary)] italic">
            No departments configured yet.
          </li>
        ) : (
          departments.map((d) => (
            <li key={d.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-2">
              {editingId === d.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename(d.id)}
                  className="border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-1.5 text-sm shadow-xs focus:ring-brand-blue focus:border-brand-blue flex-1 min-w-[140px] max-w-xs"
                />
              ) : (
                <span className="text-sm text-gray-900 dark:text-[var(--text-primary)]">{d.name}</span>
              )}
              <div className="flex items-center space-x-2 shrink-0">
                {editingId === d.id ? (
                  <>
                    <button
                      onClick={() => handleRename(d.id)}
                      className="text-brand-green hover:text-green-700 inline-flex"
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 dark:text-[var(--text-tertiary)] hover:text-gray-600 dark:text-[var(--text-secondary)] inline-flex"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(d)}
                      className="text-brand-blue hover:text-blue-700 inline-flex"
                      title="Rename"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(d)}
                      className="text-brand-red hover:text-red-700 inline-flex"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleAdd} className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)] flex gap-3">
        <input
          type="text"
          placeholder="New department name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm shadow-xs focus:ring-brand-blue focus:border-brand-blue"
        />
        <button
          type="submit"
          className="inline-flex items-center bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </button>
      </form>

      {deletingDept && (
        <div className="scrim" onClick={() => setDeletingDept(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div className="mt grow text-brand-red flex items-center gap-2 font-semibold">
                <Trash2 className="w-5 h-5 text-brand-red" />
                Delete Department
              </div>
              <button onClick={() => setDeletingDept(null)} className="iconbtn" style={{ width: 32, height: 32 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-b space-y-4">
              {deletingDept.userCount > 0 ? (
                <>
                  <div className="p-3 text-sm rounded-sm bg-red-50 dark:bg-red-950/20 text-brand-red border border-red-200 dark:border-red-900/30">
                    <p className="font-semibold mb-1">Warning: Active Users Affected</p>
                    <p>
                      There are <strong>{deletingDept.userCount}</strong> user(s) assigned to this department.
                      Removing them will add them to the <strong>Unspecified</strong> department.
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-[var(--text-secondary)]">
                    Are you sure you want to delete this department? Please type <strong>Yes</strong> to confirm.
                  </p>
                  <input
                    type="text"
                    placeholder='Type "Yes" to confirm'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm shadow-xs focus:ring-brand-blue focus:border-brand-blue"
                  />
                </>
              ) : (
                <p className="text-sm text-gray-700 dark:text-[var(--text-secondary)]">
                  Are you sure you want to delete the department <strong>{deletingDept.name}</strong>?
                </p>
              )}

              <div className="flex justify-end gap-2 pt-4 animate-in fade-in zoom-in-95 duration-200" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <button
                  type="button"
                  onClick={() => setDeletingDept(null)}
                  className="btn btn-secondary px-4 py-2 text-sm rounded-sm border border-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deletingDept.userCount > 0 && confirmText !== "Yes"}
                  className="bg-brand-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState("policies");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">Global Settings</h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
          Configure global organizational policies and thresholds.
        </p>
      </div>

      <div className="border-b border-gray-200 dark:border-[var(--border-subtle)] mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: "policies", label: "Policies" },
            { key: "departments", label: "Departments" },
            { key: "alerts", label: "Alerts" },
            { key: "backups", label: "Backups" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                tab === t.key
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-gray-500 dark:text-[var(--text-tertiary)] hover:text-gray-700 dark:text-[var(--text-secondary)] hover:border-gray-300 dark:border-[var(--border-default)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "policies" ? (
        <PoliciesTab />
      ) : tab === "departments" ? (
        <DepartmentsTab />
      ) : tab === "backups" ? (
        <BackupsTab />
      ) : (
        <AlertsTab />
      )}
    </div>
  );
}
