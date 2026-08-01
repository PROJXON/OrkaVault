import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { format } from "date-fns";

const formatRequestType = (type) => {
  const map = {
    VIEW_90S: "Single View (90s)",
    TEMP_24H: "Temporary (24h)",
    ONGOING: "Indefinite",
  };
  return map[type] || type.replace(/_/g, " ");
};

// Same shape as Vault.jsx's helper of the same name. grantExpiresAt is
// populated the moment a request is approved (a 24h "must view by" deadline)
// and then replaced with the real access window on first reveal — see
// backend/src/services/accessRequests.ts + routes/accounts.ts.
const getGrantExpirationInfo = (grantExpiresAt) => {
  if (!grantExpiresAt) return null;
  const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
  if (msRemaining <= 0) return { expired: true, text: "Expired" };

  const totalSecs = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  // Always include seconds — re-rendered every second (see the `tick`
  // interval below) specifically so the countdown visibly moves.
  let text = "";
  if (hours > 0) {
    text = `${hours}h ${minutes}m ${seconds}s left`;
  } else if (minutes > 0) {
    text = `${minutes}m ${seconds}s left`;
  } else {
    text = `${seconds}s left`;
  }
  return { expired: false, text };
};

export default function Requests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [accountsById, setAccountsById] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const [{ data: reqs }, { data: accounts }] = await Promise.all([
          api.get("/requests?type=my"),
          api.get("/accounts"),
        ]);
        setRequests(reqs);
        setAccountsById(Object.fromEntries(accounts.map((a) => [a.id, a])));
      } catch (e) {
        console.error("Failed to load requests");
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, []);

  // Re-render every second so the Time Left countdown (computed from
  // Date.now() at render time) visibly ticks while this page is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const getTimeLeft = (req) => {
    if (req.status !== "APPROVED") return "—";
    const acct = accountsById[req.account.id];
    if (!acct?.hasGrant) return "Expired — request again";
    if (!acct.grantExpiresAt) return "Ongoing";
    const info = getGrantExpirationInfo(acct.grantExpiresAt);
    if (!info) return "—";
    if (info.expired) return "Expired";
    return acct.grantFirstRevealedAt ? info.text : `View within ${info.text}`;
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="bg-green-100 text-brand-green px-2 py-1 rounded-full text-xs font-medium">
            Approved
          </span>
        );
      case "DENIED":
        return (
          <span className="bg-red-100 text-brand-red px-2 py-1 rounded-full text-xs font-medium">
            Denied
          </span>
        );
      default:
        return (
          <span className="bg-amber-100 text-brand-amber px-2 py-1 rounded-full text-xs font-medium">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">My Access Requests</h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
          Track the status of your vault access requests.
        </p>
      </div>

      <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Reason
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Submitted
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Time Left
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
            ) : requests.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  No requests found
                </td>
              </tr>
            ) : (
              requests.map((req) => {
                const acct = accountsById[req.account.id];
                return (
                  <tr
                    key={req.id}
                    onClick={acct ? () => navigate(`/vault?select=${acct.id}`) : undefined}
                    className={acct ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-[var(--bg-canvas)]" : undefined}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">
                      {req.account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                      {formatRequestType(req.requestType)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-[var(--text-tertiary)] max-w-xs truncate">
                      {req.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                      {format(new Date(req.submittedAt), "MMM d, yyyy, h:mm a")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(req.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                      {getTimeLeft(req)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
