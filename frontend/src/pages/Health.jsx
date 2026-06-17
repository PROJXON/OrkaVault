import React, { useState, useEffect } from "react";
import api from "../lib/api";
import HealthPill from "../components/HealthPill";
import { RefreshCw } from "lucide-react";

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
      alert("Failed to re-score password");
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Password Health Audit
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          Monitor and enforce password strength across all organizational
          accounts.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  Loading...
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No accounts
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {acc.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {acc.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
  );
}
