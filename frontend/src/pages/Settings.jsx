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
    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200 mb-6">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
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
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Minimum Password Health Score
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Passwords scoring below this threshold will trigger alerts to the
            owner and admins.
          </p>
          <input
            type="number"
            value={settings.MIN_HEALTH_SCORE}
            onChange={(e) => setSettings({ ...settings, MIN_HEALTH_SCORE: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200" />

        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Rotation Warning Window (Days)
          </label>
          <p className="text-sm text-gray-500 mb-3">
            How many days before a password rotation is due should alerts
            begin?
          </p>
          <input
            type="number"
            value={settings.ROTATION_WARNING_DAYS}
            onChange={(e) => setSettings({ ...settings, ROTATION_WARNING_DAYS: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200" />

        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Offboarding Alert Window (Days)
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Alert admins when a user's set end date falls within this window.
          </p>
          <input
            type="number"
            value={settings.OFFBOARDING_ALERT_DAYS}
            onChange={(e) => setSettings({ ...settings, OFFBOARDING_ALERT_DAYS: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-32"
          />
        </div>

        <hr className="border-gray-200" />

        <div className="flex items-start justify-between">
          <div className="pr-6">
            <label className="text-sm font-medium text-gray-900 block mb-1">
              Require Authenticator QR Code for Google Workspace
            </label>
            <p className="text-sm text-gray-500">
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
            className={`relative inline-flex shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue ${
              settings.REQUIRE_TOTP_QR !== "false" ? "bg-brand-blue" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                settings.REQUIRE_TOTP_QR !== "false" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 flex justify-end">
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
    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200 mb-6">
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
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
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Discord Webhook URL
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Access-request activity (new/approved/denied) will be posted to
            this channel. Create one via Channel Settings &rarr;
            Integrations &rarr; Webhooks in Discord. Leave blank to disable.
          </p>
          <input
            type="text"
            placeholder="https://discord.com/api/webhooks/..."
            value={urls.DISCORD_WEBHOOK_URL}
            onChange={(e) => setUrls({ ...urls, DISCORD_WEBHOOK_URL: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200" />

        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Google Chat Webhook URL
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Same events, posted to a Google Chat space. Create one via
            Space &rarr; Apps &amp; integrations &rarr; Webhooks. Leave
            blank to disable.
          </p>
          <input
            type="text"
            placeholder="https://chat.googleapis.com/v1/spaces/..."
            value={urls.GCHAT_WEBHOOK_URL}
            onChange={(e) => setUrls({ ...urls, GCHAT_WEBHOOK_URL: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200" />

        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Workspace Login Allow-List (IPs)
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Comma-separated IP addresses/prefixes. Workspace logins from
            outside this list trigger an alert (Phase 2, Workspace
            monitoring). Leave blank to disable this check.
          </p>
          <input
            type="text"
            placeholder="203.0.113.4, 198.51.100.0"
            value={urls.WORKSPACE_ALLOWED_IPS}
            onChange={(e) => setUrls({ ...urls, WORKSPACE_ALLOWED_IPS: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>

        <hr className="border-gray-200" />

        <div>
          <label className="text-sm font-medium text-gray-900 block mb-1">
            Workspace Login Allow-List (Countries)
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Comma-separated ISO country codes. Best-effort: only checked
            when Google's event includes a country field. Leave blank to
            disable this check.
          </p>
          <input
            type="text"
            placeholder="US, CA"
            value={urls.WORKSPACE_ALLOWED_COUNTRIES}
            onChange={(e) => setUrls({ ...urls, WORKSPACE_ALLOWED_COUNTRIES: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:ring-brand-blue focus:border-brand-blue sm:text-sm w-full"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 text-right">
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

function DepartmentsTab() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");

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

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete "${d.name}"? Users currently assigned to it must be reassigned first.`)) return;
    setError("");
    try {
      await api.delete(`/departments/${d.id}`);
      await fetchDepartments();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to delete department.");
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200 mb-6">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Departments
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Configure the department list users can be assigned to (Profile,
          Registration, and Users &amp; Roles all pull from this list).
        </p>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm text-brand-red">{error}</p>
        </div>
      )}

      <ul className="divide-y divide-gray-200">
        {loading ? (
          <li className="px-6 py-4 text-sm text-gray-500">Loading...</li>
        ) : departments.length === 0 ? (
          <li className="px-6 py-4 text-sm text-gray-500 italic">
            No departments configured yet.
          </li>
        ) : (
          departments.map((d) => (
            <li key={d.id} className="px-6 py-3 flex items-center justify-between">
              {editingId === d.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRename(d.id)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm shadow-sm focus:ring-brand-blue focus:border-brand-blue w-64"
                />
              ) : (
                <span className="text-sm text-gray-900">{d.name}</span>
              )}
              <div className="flex items-center space-x-2">
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
                      className="text-gray-400 hover:text-gray-600 inline-flex"
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

      <form onSubmit={handleAdd} className="px-6 py-4 bg-gray-50 flex gap-3">
        <input
          type="text"
          placeholder="New department name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm focus:ring-brand-blue focus:border-brand-blue"
        />
        <button
          type="submit"
          className="inline-flex items-center bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </button>
      </form>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState("policies");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Global Settings</h1>
        <p className="mt-2 text-sm text-gray-700">
          Configure global organizational policies and thresholds.
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: "policies", label: "Policies" },
            { key: "departments", label: "Departments" },
            { key: "alerts", label: "Alerts" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                tab === t.key
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
      ) : (
        <AlertsTab />
      )}
    </div>
  );
}
