import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare, Folder, Users, Activity, Shield, Globe, Settings, ShieldCheck, HeartPulse, Link2,
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import api from "../lib/api";
import { Bar, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const CONNECTED_APPS_PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];
const CONNECTED_APPS_OTHER_COLOR = "#e5e7eb";
const CONNECTED_APPS_PIE_MAX_SLICES = 10;

export default function ManageConsole() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectedAppsData, setConnectedAppsData] = useState(null);
  const [connectedAppsLoading, setConnectedAppsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await api.get("/directory");
        setData(response.data);
      } catch (error) {
        console.error("Failed to load metrics", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  useEffect(() => {
    // Workspace data is ADMIN-only (Managers don't get the Workspace
    // Activity tile either) and reads whatever's already synced — this
    // never triggers a live Google sync itself, so visiting this page
    // stays fast regardless of org size.
    if (user.role !== "ADMIN") {
      setConnectedAppsLoading(false);
      return;
    }
    const fetchConnectedApps = async () => {
      try {
        const [usersRes, topRes] = await Promise.all([
          api.get("/workspace-activity/connected-apps/users"),
          api.get("/workspace-activity/connected-apps/top?limit=5"),
        ]);
        setConnectedAppsData({ users: usersRes.data, top: topRes.data });
      } catch (error) {
        console.error("Failed to load connected apps summary", error);
      } finally {
        setConnectedAppsLoading(false);
      }
    };
    fetchConnectedApps();
  }, [user.role]);

  const tiles = [
    { name: "Approvals", href: "/approvals", icon: CheckSquare, desc: "Review and act on pending access requests for accounts in your scope.", roles: ["MANAGER", "ADMIN"] },
    { name: "My Collections", href: "/my-collections", icon: Folder, desc: "Manage the account collections assigned to you.", roles: ["MANAGER"] },
    { name: "Directory", href: "/directory", icon: Globe, desc: "Browse the full organization directory.", roles: ["ADMIN"] },
    { name: "Users & Roles", href: "/users", icon: Users, desc: "Approve new users, manage roles, and offboard staff.", roles: ["ADMIN"] },
    { name: "Collections", href: "/collections", icon: Folder, desc: "Create and assign account collections to managers.", roles: ["ADMIN"] },
    { name: "Health Audit", href: "/health", icon: Activity, desc: "Review password health scores across the vault.", roles: ["ADMIN"] },
    { name: "Audit Log", href: "/audit", icon: Shield, desc: "Inspect the append-only action log for the organization.", roles: ["ADMIN"] },
    { name: "Workspace Activity", href: "/workspace-activity", icon: Globe, desc: "Monitor Google Workspace login and OAuth-grant activity.", roles: ["ADMIN"] },
    { name: "Settings", href: "/settings", icon: Settings, desc: "Configure org-wide policies, departments, and alerts.", roles: ["ADMIN"] },
  ].filter((t) => t.roles.includes(user.role));

  // Chart data
  const auditActivityData = data?.metrics?.auditActivity || [];
  const barData = {
    labels: auditActivityData.map(a =>
      new Date(a.date).toLocaleDateString("en-US", { weekday: "short" })
    ),
    datasets: [{
      label: "Audit Events",
      data: auditActivityData.map(a => a.count),
      backgroundColor: "#3b82f6",
      borderRadius: 4,
    }],
  };
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { title: (items) => auditActivityData[items[0].dataIndex]?.date } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#6b7280" } },
      y: { border: { display: false }, grid: { color: "#f3f4f6" }, ticks: { color: "#6b7280", precision: 0 } },
    },
  };

  const healthDist = data?.metrics?.healthDistribution || { STRONG: 0, MEDIUM: 0, WEAK: 0 };
  const doughnutData = {
    labels: ["Strong", "Medium", "Weak"],
    datasets: [{
      data: [healthDist.STRONG, healthDist.MEDIUM, healthDist.WEAK],
      backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const internationalCount = data?.metrics?.globalRequestsCount || 0;
  const domesticCount = data?.metrics?.domesticRequestsCount || 0;
  const pieData = {
    labels: ["Global Access", "Domestic Only"],
    datasets: [{
      data: [internationalCount, domesticCount],
      backgroundColor: ["#8b5cf6", "#e5e7eb"],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  // Connected Apps: pie of accounts by how many third-party apps they have
  // connected. Capped to the top N accounts + an "Other" slice rather than
  // one slice per account, so this stays readable regardless of org size.
  const connectedAppsAccounts = (connectedAppsData?.users || [])
    .filter((u) => u.appCount > 0)
    .sort((a, b) => b.appCount - a.appCount);
  const topAccounts = connectedAppsAccounts.slice(0, CONNECTED_APPS_PIE_MAX_SLICES);
  const otherAccountsTotal = connectedAppsAccounts
    .slice(CONNECTED_APPS_PIE_MAX_SLICES)
    .reduce((sum, u) => sum + u.appCount, 0);
  const connectedAppsAccountsPieData = {
    labels: [...topAccounts.map((u) => u.userEmail), ...(otherAccountsTotal > 0 ? ["Other"] : [])],
    datasets: [{
      data: [...topAccounts.map((u) => u.appCount), ...(otherAccountsTotal > 0 ? [otherAccountsTotal] : [])],
      backgroundColor: [
        ...topAccounts.map((_, i) => CONNECTED_APPS_PIE_COLORS[i % CONNECTED_APPS_PIE_COLORS.length]),
        ...(otherAccountsTotal > 0 ? [CONNECTED_APPS_OTHER_COLOR] : []),
      ],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };
  const topConnectedApps = connectedAppsData?.top || [];
  const maxTopAppCount = Math.max(1, ...topConnectedApps.map((a) => a.count));

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="admin-head mb-8">
        <div>
          <h1>Manage Console</h1>
          <p>
            High-level management for OrkaVault — approvals, collections, users and
            org-wide configuration live here, separate from your own vault.
          </p>
        </div>
        <span className="grow" />
        <span className="admin-badge font-medium">
          <ShieldCheck width={12} height={12} /> {user.role === "ADMIN" ? "Admin Mode" : "Manager Mode"}
        </span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 dark:text-[var(--text-tertiary)] bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] mb-8 shadow-xs">
          Loading system metrics...
        </div>
      ) : data ? (
        <>
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              { icon: Users, label: "Total Personnel", value: data.metrics.totalPersonnel || 0, color: "text-blue-600", bg: "bg-blue-50" },
              { icon: HeartPulse, label: "Avg Vault Health", value: `${data.metrics.avgHealthScore || 0}%`, color: "text-emerald-600", bg: "bg-emerald-50" },
              { icon: Activity, label: "7-Day Audit Events", value: data.metrics.sevenDayAuditCount || 0, color: "text-indigo-600", bg: "bg-indigo-50" },
              { icon: Globe, label: "Global Access Requested", value: internationalCount, color: "text-violet-600", bg: "bg-violet-50" },
            ].map((stat, i) => (
              <div key={i} className="bg-white dark:bg-[var(--bg-surface)] rounded-xl p-6 border border-gray-200 dark:border-[var(--border-subtle)] shadow-xs hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-500 dark:text-[var(--text-tertiary)]">{stat.label}</span>
                  <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-[var(--text-primary)]">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
            <div className="bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 shadow-xs flex flex-col">
              <h3 className="text-sm font-bold text-gray-900 dark:text-[var(--text-primary)] uppercase tracking-wide mb-6 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-gray-400 dark:text-[var(--text-tertiary)]" /> Audit Activity (7 Days)
              </h3>
              <div className="flex-1 min-h-[200px]"><Bar data={barData} options={barOptions} /></div>
            </div>
            <div className="bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 shadow-xs flex flex-col items-center">
              <h3 className="text-sm font-bold text-gray-900 dark:text-[var(--text-primary)] uppercase tracking-wide mb-6 flex items-center self-start">
                <HeartPulse className="w-4 h-4 mr-2 text-gray-400 dark:text-[var(--text-tertiary)]" /> Health Distribution
              </h3>
              <div className="w-40 h-40"><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
              <div className="mt-6 w-full space-y-2">
                {[["bg-emerald-500", "Strong", healthDist.STRONG], ["bg-amber-500", "Medium", healthDist.MEDIUM], ["bg-red-500", "Weak", healthDist.WEAK]].map(([color, label, val]) => (
                  <div key={label} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0">
                    <span className="flex items-center text-gray-600 dark:text-[var(--text-secondary)]"><div className={`w-3 h-3 rounded-full ${color} mr-2`} />{label}</span>
                    <span className="font-bold text-gray-900 dark:text-[var(--text-primary)]">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 shadow-xs flex flex-col items-center">
              <h3 className="text-sm font-bold text-gray-900 dark:text-[var(--text-primary)] uppercase tracking-wide mb-6 flex items-center self-start">
                <Globe className="w-4 h-4 mr-2 text-gray-400 dark:text-[var(--text-tertiary)]" /> Global Access Ratio
              </h3>
              <div className="w-40 h-40"><Pie data={pieData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
              <div className="mt-6 w-full space-y-3">
                <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                  <span className="flex items-center text-gray-600 dark:text-[var(--text-secondary)]"><div className="w-3 h-3 rounded-full bg-violet-500 mr-2" /> Global</span>
                  <span className="font-bold text-gray-900 dark:text-[var(--text-primary)]">{internationalCount}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center text-gray-600 dark:text-[var(--text-secondary)]"><div className="w-3 h-3 rounded-full bg-gray-200 mr-2" /> Domestic</span>
                  <span className="font-bold text-gray-900 dark:text-[var(--text-primary)]">{domesticCount}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {user.role === "ADMIN" && (
        connectedAppsLoading ? (
          <div className="py-12 text-center text-gray-500 dark:text-[var(--text-tertiary)] bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] mb-8 shadow-xs">
            Loading connected apps summary...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
            <div className="bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 shadow-xs flex flex-col items-center">
              <h3 className="text-sm font-bold text-gray-900 dark:text-[var(--text-primary)] uppercase tracking-wide mb-6 flex items-center self-start">
                <Link2 className="w-4 h-4 mr-2 text-gray-400 dark:text-[var(--text-tertiary)]" /> Connected Apps by Account
              </h3>
              {connectedAppsAccounts.length === 0 ? (
                <div className="py-8 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  No connected apps synced yet — visit Workspace Activity to sync.
                </div>
              ) : (
                <>
                  <div className="w-48 h-48"><Pie data={connectedAppsAccountsPieData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
                  <div className="mt-6 w-full space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                    {connectedAppsAccountsPieData.labels.map((label, i) => (
                      <div key={label} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0">
                        <span className="flex items-center text-gray-600 dark:text-[var(--text-secondary)] min-w-0">
                          <span
                            className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                            style={{ backgroundColor: connectedAppsAccountsPieData.datasets[0].backgroundColor[i] }}
                          />
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="font-bold text-gray-900 dark:text-[var(--text-primary)] ml-2 flex-shrink-0">
                          {connectedAppsAccountsPieData.datasets[0].data[i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={() => navigate("/workspace-activity")}
                className="mt-4 text-xs text-brand-blue hover:underline self-start"
              >
                View full account list &rarr;
              </button>
            </div>
            <div className="bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 shadow-xs flex flex-col">
              <h3 className="text-sm font-bold text-gray-900 dark:text-[var(--text-primary)] uppercase tracking-wide mb-6 flex items-center">
                <Link2 className="w-4 h-4 mr-2 text-gray-400 dark:text-[var(--text-tertiary)]" /> Top 5 Connected Apps
              </h3>
              {topConnectedApps.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                  No connected apps synced yet
                </div>
              ) : (
                <div className="space-y-3">
                  {topConnectedApps.map((app, i) => (
                    <div key={app.name}>
                      <div className="flex justify-between items-center text-sm mb-1">
                        <span className="flex items-center text-gray-700 dark:text-[var(--text-secondary)] min-w-0">
                          <span className="w-5 text-gray-400 dark:text-[var(--text-tertiary)] font-mono flex-shrink-0">{i + 1}.</span>
                          <span className="truncate">{app.name}</span>
                        </span>
                        <span className="font-bold text-gray-900 dark:text-[var(--text-primary)] ml-2 flex-shrink-0">{app.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-[var(--bg-muted)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-blue"
                          style={{ width: `${(app.count / maxTopAppCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {tiles.map((tile) => (
          <button key={tile.name} className="admin-tile text-left" onClick={() => navigate(tile.href)}>
            <div className="at-ic"><tile.icon width={20} height={20} /></div>
            <div className="at-t">{tile.name}</div>
            <div className="at-d">{tile.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
