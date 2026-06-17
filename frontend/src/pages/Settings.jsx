import React, { useState, useEffect } from "react";
import api from "../lib/api";

export default function Settings() {
  const [settings, setSettings] = useState({
    MIN_HEALTH_SCORE: "40",
    ROTATION_WARNING_DAYS: "7",
    OFFBOARDING_ALERT_DAYS: "30"
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Global Settings</h1>
        <p className="mt-2 text-sm text-gray-700">
          Configure global organizational policies and thresholds.
        </p>
      </div>

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
    </div>
  );
}
