import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import {
  Users, Shield, Globe, Search, MonitorSmartphone, X, Mail,
  Briefcase, CheckCircle, HeartPulse, Activity, Trash2, Edit2, Save, Clock, UserX
} from "lucide-react";
import { Bar, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const ACCESS_TYPE_LABELS = {
  VIEW_90S: "Single View (90s)",
  TEMP_24H: "Temporary (24h)",
  ONGOING: "Ongoing",
};

const ACCESS_TYPE_COLORS = {
  VIEW_90S: "bg-purple-100 text-purple-700",
  TEMP_24H: "bg-amber-100 text-amber-700",
  ONGOING: "bg-green-100 text-green-700",
};

export default function Directory() {
  const [data, setData] = useState({ metrics: {}, users: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [filterRole, setFilterRole] = useState("All");

  // Revoke confirmation state
  const [revokeModal, setRevokeModal] = useState(null); // { grantId, accountName }
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Edit grant state
  const [editingGrant, setEditingGrant] = useState(null); // { grantId, currentType }
  const [editType, setEditType] = useState("ONGOING");
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => { fetchDirectory(); }, []);

  useEffect(() => {
    if (data.users.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get("user");
      if (userId) {
        const found = data.users.find(u => u.id === userId);
        if (found) {
          setSelectedUser(found);
          // Optional: Remove query param from URL so refresh doesn't trigger it again
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }
  }, [data.users]);

  const fetchDirectory = async () => {
    try {
      const response = await api.get("/directory");
      setData(response.data);
    } catch (error) {
      console.error("Failed to load directory", error);
    } finally {
      setLoading(false);
    }
  };

  const openRevokeModal = (grantId, accountName) => {
    setRevokeModal({ grantId, accountName });
  };

  const confirmRevoke = async () => {
    if (!revokeModal) return;
    setRevokeLoading(true);
    try {
      await api.delete(`/grants/${revokeModal.grantId}`);
      const grantId = revokeModal.grantId;
      setSelectedUser(prev => ({ ...prev, resources: prev.resources.filter(r => r.id !== grantId) }));
      setData(prev => ({
        ...prev,
        users: prev.users.map(u =>
          u.id === selectedUser.id
            ? { ...u, resources: u.resources.filter(r => r.id !== grantId) }
            : u
        ),
      }));
      setRevokeModal(null);
    } catch (error) {
      console.error("Failed to revoke access", error);
    } finally {
      setRevokeLoading(false);
    }
  };

  const openEditGrant = (grantId, currentType) => {
    setEditingGrant(grantId);
    setEditType(currentType);
  };

  const cancelEditGrant = () => {
    setEditingGrant(null);
  };

  const saveEditGrant = async (grantId) => {
    setEditLoading(true);
    try {
      await api.patch(`/grants/${grantId}`, { accessType: editType });
      // Update local state
      const updateResources = (resources) =>
        resources.map(r => r.id === grantId ? { ...r, accessType: editType } : r);
      setSelectedUser(prev => ({ ...prev, resources: updateResources(prev.resources) }));
      setData(prev => ({
        ...prev,
        users: prev.users.map(u =>
          u.id === selectedUser.id
            ? { ...u, resources: updateResources(u.resources) }
            : u
        ),
      }));
      setEditingGrant(null);
    } catch (error) {
      console.error("Failed to update grant", error);
    } finally {
      setEditLoading(false);
    }
  };

  const filteredUsers = useMemo(() =>
    data.users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === "All" || u.role === filterRole;
      return matchesSearch && matchesRole;
    }),
    [data.users, search, filterRole]
  );

  const getInitials = (name) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);

  // Chart data
  const auditActivityData = data.metrics.auditActivity || [];
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

  const healthDist = data.metrics.healthDistribution || { STRONG: 0, MEDIUM: 0, WEAK: 0 };
  const doughnutData = {
    labels: ["Strong", "Medium", "Weak"],
    datasets: [{
      data: [healthDist.STRONG, healthDist.MEDIUM, healthDist.WEAK],
      backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const internationalCount = data.metrics.globalRequestsCount || 0;
  const domesticCount = data.metrics.domesticRequestsCount || 0;
  const pieData = {
    labels: ["Global Access", "Domestic Only"],
    datasets: [{
      data: [internationalCount, domesticCount],
      backgroundColor: ["#8b5cf6", "#e5e7eb"],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  if (loading) return <div className="p-8 text-gray-500 flex justify-center items-center h-64">Loading directory...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white rounded-xl p-8 mb-8 border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Security &amp; Personnel Dashboard</h1>
          <p className="text-gray-500 mt-2 max-w-xl">Directory overview. Monitor team access, evaluate global vault health, and track recent audit activity.</p>
        </div>
        <div className="flex items-center space-x-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium border border-green-200">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>System Live</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { icon: Users, label: "Total Personnel", value: data.metrics.totalPersonnel || 0, color: "text-blue-600", bg: "bg-blue-50" },
          { icon: HeartPulse, label: "Avg Vault Health", value: `${data.metrics.avgHealthScore || 0}%`, color: "text-emerald-600", bg: "bg-emerald-50" },
          { icon: Activity, label: "7-Day Audit Events", value: data.metrics.sevenDayAuditCount || 0, color: "text-indigo-600", bg: "bg-indigo-50" },
          { icon: Globe, label: "Global Access", value: internationalCount, color: "text-violet-600", bg: "bg-violet-50" },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500">{stat.label}</span>
              <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-6 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-gray-400" /> Audit Activity (7 Days)
          </h3>
          <div className="flex-1 min-h-[200px]"><Bar data={barData} options={barOptions} /></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-center">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-6 flex items-center self-start">
            <HeartPulse className="w-4 h-4 mr-2 text-gray-400" /> Health Distribution
          </h3>
          <div className="w-40 h-40"><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          <div className="mt-6 w-full space-y-2">
            {[["bg-emerald-500", "Strong", healthDist.STRONG], ["bg-amber-500", "Medium", healthDist.MEDIUM], ["bg-red-500", "Weak", healthDist.WEAK]].map(([color, label, val]) => (
              <div key={label} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0">
                <span className="flex items-center text-gray-600"><div className={`w-3 h-3 rounded-full ${color} mr-2`} />{label}</span>
                <span className="font-bold text-gray-900">{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-center">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-6 flex items-center self-start">
            <Globe className="w-4 h-4 mr-2 text-gray-400" /> Global Access Ratio
          </h3>
          <div className="w-40 h-40"><Pie data={pieData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          <div className="mt-6 w-full space-y-3">
            <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
              <span className="flex items-center text-gray-600"><div className="w-3 h-3 rounded-full bg-violet-500 mr-2" /> Global</span>
              <span className="font-bold text-gray-900">{internationalCount}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center text-gray-600"><div className="w-3 h-3 rounded-full bg-gray-200 mr-2" /> Domestic</span>
              <span className="font-bold text-gray-900">{domesticCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search personnel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg py-2 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto custom-scrollbar">
          {["All", "ADMIN", "MANAGER", "USER"].map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterRole === role ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
            >
              {role === "All" ? "All Roles" : role}
            </button>
          ))}
        </div>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
            No personnel found matching your criteria.
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className="group bg-white rounded-xl border border-gray-200 p-6 cursor-pointer shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                  {getInitials(user.name)}
                </div>
                <div>
                  <h3 className="text-gray-900 font-bold text-lg group-hover:text-blue-600 transition-colors">{user.name}</h3>
                  <p className="text-sm text-gray-500">{user.department || "Unassigned"}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded border border-gray-200">{user.role}</span>
                {user.internationalAccess && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium rounded flex items-center">
                    <Globe className="w-3 h-3 mr-1" /> Global
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Slide-over Detail Panel */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedUser(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-y-auto">
            <div className="p-6 bg-white border-b border-gray-100 sticky top-0 z-10 flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Personnel Dossier</h2>
              <button onClick={() => setSelectedUser(null)} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 flex-1">
              {/* Avatar */}
              <div className="flex items-center mb-8">
                <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-3xl shadow-sm border-4 border-white">
                  {getInitials(selectedUser.name)}
                </div>
                <div className="ml-5">
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight">{selectedUser.name}</h2>
                  <div className="flex items-center mt-2">
                    <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200 flex items-center font-medium">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Verified Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Identity */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Identity &amp; Role</h4>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-3">
                    <div className="flex items-center text-sm">
                      <Mail className="w-4 h-4 text-gray-400 mr-3" />
                      <span className="text-gray-700">{selectedUser.email}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Briefcase className="w-4 h-4 text-gray-400 mr-3" />
                      <span className="text-gray-700">{selectedUser.role} • {selectedUser.department || "Unassigned"}</span>
                    </div>
                  </div>
                </div>

                {/* Devices */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Known Devices</h4>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{selectedUser.devices?.length || 0}</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {selectedUser.devices?.length > 0 ? (
                      selectedUser.devices.map((dev, idx) => (
                        <div key={idx} className="flex items-center p-3">
                          <MonitorSmartphone className="w-4 h-4 text-gray-400 mr-3 shrink-0" />
                          <span className="text-sm text-gray-700 truncate">{dev}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic p-4 text-center">No devices registered</p>
                    )}
                  </div>
                </div>

                {/* Global Status */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Global Status</h4>
                  {selectedUser.internationalAccess ? (
                    <div className="flex items-start bg-amber-50 border border-amber-200 p-4 rounded-lg">
                      <Globe className="w-5 h-5 text-amber-500 mr-3 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-amber-900">International Clearance</p>
                        <p className="text-xs text-amber-700 mt-1">Authorized for access outside domestic IP ranges.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center p-3 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                      Domestic Only (Standard Protocol)
                    </div>
                  )}
                </div>

                {/* Accessible Vault Accounts */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Accessible Vault Accounts</h4>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{selectedUser.resources?.length || 0}</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {selectedUser.resources?.length > 0 ? (
                      selectedUser.resources.map((res) => (
                        <div key={res.id} className="p-3">
                          {editingGrant === res.id ? (
                            /* ── Inline Edit Mode ── */
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <Shield className="w-4 h-4 text-blue-500 mr-2 shrink-0" />
                                <span className="text-sm font-medium text-gray-800 truncate">{res.name}</span>
                              </div>
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="VIEW_90S">Single View (90 seconds)</option>
                                <option value="TEMP_24H">Temporary (24 hours)</option>
                                <option value="ONGOING">Ongoing Assignment</option>
                              </select>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveEditGrant(res.id)}
                                  disabled={editLoading}
                                  className="flex-1 flex items-center justify-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                  <Save className="w-3 h-3" /> Save
                                </button>
                                <button
                                  onClick={cancelEditGrant}
                                  className="flex-1 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── View Mode ── */
                            <div className="flex justify-between items-center">
                              <div className="flex items-center truncate flex-1 min-w-0 mr-2">
                                <Shield className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                                <div className="truncate">
                                  <span className="text-sm text-gray-700 truncate block">{res.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 ${ACCESS_TYPE_COLORS[res.accessType] || "bg-gray-100 text-gray-600"}`}>
                                    <Clock className="w-2.5 h-2.5" />
                                    {ACCESS_TYPE_LABELS[res.accessType] || res.accessType}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openEditGrant(res.id, res.accessType)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Edit Access Type"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openRevokeModal(res.id, res.name)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Revoke Access"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic p-4 text-center">No active vault resources allocated.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Deactivate User Button */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to completely deactivate ${selectedUser.name}?`)) {
                      if (window.confirm(`Is this user transitioning to GAP? (Click OK for Yes to extend 6 months, Cancel for No to revoke now)`)) {
                        api.patch(`/users/${selectedUser.id}/gap-extend`).then(() => {
                          alert("User access extended by 6 months.");
                          fetchDirectory();
                        }).catch(console.error);
                      } else {
                        api.delete(`/users/${selectedUser.id}`).then(() => {
                          alert("User access completely revoked.");
                          setSelectedUser(null);
                          fetchDirectory();
                        }).catch(console.error);
                      }
                    }
                  }}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  <UserX className="-ml-1 mr-2 h-4 w-4" />
                  Deactivate Personnel
                </button>
              </div>

            </div>
          </div>
        </>
      )}

      {/* ── Revoke Confirmation Modal ── */}
      {revokeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-gray-900/50" onClick={() => setRevokeModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 z-10">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Revoke Access</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to revoke access to{" "}
              <span className="font-semibold text-gray-900">{revokeModal.accountName}</span>{" "}
              for{" "}
              <span className="font-semibold text-gray-900">{selectedUser?.name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevokeModal(null)}
                disabled={revokeLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                disabled={revokeLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {revokeLoading ? "Revoking..." : "Revoke Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
