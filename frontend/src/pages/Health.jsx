import React, { useState, useEffect } from "react";
import api from "../lib/api";
import HealthPill from "../components/HealthPill";
import { RefreshCw } from "lucide-react";

const formatLastChanged = (acc) => {
  const date = acc.lastUpdatedAt || acc.createdAt;
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export default function Health() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(null);

  const fetchScores = async () => {
    try {
      const { data } = await api.get("/health/scores");
      setAccounts(data);
    } catch (e) {
      console.error("Failed to load health scores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
  }, []);

  const handleRecheck = async (id) => {
    setChecking(id);
    try {
      await api.post(`/health/check/${id}`);
      await fetchScores();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to re-score password");
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">
          Password Health Audit
        </h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
          Monitor and enforce password strength across all organizational
          accounts.
        </p>
      </div>

      {/* Mobile: one card per account instead of a wide table */}
      <div className="row-cards md:hidden">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : accounts.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No accounts</div>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} className="row-card">
              <div className="row-card-title">{acc.name}</div>
              <div className="row-card-field">
                <span className="rcf-label">Username</span>
                <span className="rcf-value">{acc.username}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Score</span>
                <span className="rcf-value flex items-center gap-2 justify-end">
                  <span className="w-16 bg-gray-200 rounded-full h-2 shrink-0">
                    <span
                      className={`block h-2 rounded-full ${acc.healthScore < 40 ? "bg-brand-red" : acc.healthScore < 70 ? "bg-brand-amber" : "bg-brand-green"}`}
                      style={{ width: `${acc.healthScore}%` }}
                    />
                  </span>
                  {acc.healthScore}/100
                </span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Status</span>
                <span className="rcf-value"><HealthPill label={acc.healthLabel} /></span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Last Changed</span>
                <span className="rcf-value">{formatLastChanged(acc)}</span>
              </div>
              <div className="row-card-actions">
                <button
                  onClick={() => handleRecheck(acc.id)}
                  disabled={checking === acc.id}
                  className="btn btn-secondary btn-sm flex-1"
                >
                  <RefreshCw className={`h-4 w-4 ${checking === acc.id ? "animate-spin" : ""}`} />
                  Re-evaluate
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Last Changed
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {loading ? (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  No accounts
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">
                    {acc.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {acc.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className={`h-2 rounded-full ${acc.healthScore < 40 ? "bg-brand-red" : acc.healthScore < 70 ? "bg-brand-amber" : "bg-brand-green"}`}
                          style={{ width: `${acc.healthScore}%` }}
                        />
                      </div>
                      <span>{acc.healthScore}/100</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <HealthPill label={acc.healthLabel} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {formatLastChanged(acc)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleRecheck(acc.id)}
                      disabled={checking === acc.id}
                      className="text-brand-blue hover:text-blue-700 disabled:opacity-50"
                      title="Re-evaluate"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${checking === acc.id ? "animate-spin" : ""}`}
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
