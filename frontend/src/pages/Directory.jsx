import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { format } from "date-fns";
import {
  Shield, Globe, Search, MonitorSmartphone, X, Mail,
  Briefcase, CheckCircle, Trash2, Edit2, Save, Clock, UserX
} from "lucide-react";

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

const formatRole = (role) => {
  const map = { ADMIN: "Admin", MANAGER: "Manager", USER: "User" };
  return map[role] || role;
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

  if (loading) return <div className="p-8 text-gray-500 dark:text-[var(--text-tertiary)] flex justify-center items-center h-64">Loading directory...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">Personnel Directory</h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">Browse organization directory and manage active resource access grants.</p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between bg-white dark:bg-[var(--bg-surface)] p-4 rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400 dark:text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search personnel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-50 dark:bg-[var(--bg-canvas)] border border-gray-300 dark:border-[var(--border-default)] rounded-lg py-2 pl-10 pr-4 text-gray-900 dark:text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </div>
        <div className="block md:hidden w-full">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full bg-gray-50 dark:bg-[var(--bg-canvas)] border border-gray-300 dark:border-[var(--border-default)] rounded-lg py-2 px-3 text-sm text-gray-900 dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {["All", "ADMIN", "MANAGER", "USER"].map((role) => (
              <option key={role} value={role}>
                {role === "All" ? "All Roles" : formatRole(role)}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex gap-2 overflow-x-auto w-full md:w-auto custom-scrollbar">
          {["All", "ADMIN", "MANAGER", "USER"].map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterRole === role ? "bg-gray-900 text-white" : "bg-white dark:bg-[var(--bg-surface)] text-gray-600 dark:text-[var(--text-secondary)] border border-gray-200 dark:border-[var(--border-subtle)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)]"}`}
            >
              {role === "All" ? "All Roles" : formatRole(role)}
            </button>
          ))}
        </div>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 dark:text-[var(--text-tertiary)] bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] border-dashed">
            No personnel found matching your criteria.
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => setSelectedUser(user)}
              className="group bg-white dark:bg-[var(--bg-surface)] rounded-xl border border-gray-200 dark:border-[var(--border-subtle)] p-6 cursor-pointer shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                  {getInitials(user.name)}
                </div>
                <div>
                  <h3 className="text-gray-900 dark:text-[var(--text-primary)] font-bold text-lg group-hover:text-blue-600 transition-colors">{user.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">{user.department || "Unassigned"}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-600 dark:text-[var(--text-secondary)] text-xs font-medium rounded border border-gray-200 dark:border-[var(--border-subtle)]">{formatRole(user.role)}</span>
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
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[var(--bg-surface)] shadow-2xl z-50 flex flex-col overflow-y-auto">
            <div className="p-6 bg-white dark:bg-[var(--bg-surface)] border-b border-gray-100 sticky top-0 z-10 flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-500 dark:text-[var(--text-tertiary)] uppercase tracking-widest">Personnel Dossier</h2>
              <button onClick={() => setSelectedUser(null)} className="p-2 rounded-full hover:bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-500 dark:text-[var(--text-tertiary)] transition-colors">
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
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)] leading-tight">{selectedUser.name}</h2>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200 flex items-center font-medium self-start">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Verified Active
                    </span>
                    <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] ml-1 font-medium">
                      Member since {selectedUser.createdAt ? format(new Date(selectedUser.createdAt), "MMMM yyyy") : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Last Active */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 dark:text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Last Activity</h4>
                  <div className="bg-gray-50 dark:bg-[var(--bg-canvas)] rounded-lg p-4 border border-gray-100 flex items-center text-sm">
                    <Clock className="w-4 h-4 text-gray-400 dark:text-[var(--text-tertiary)] mr-3" />
                    <span className="text-gray-700 dark:text-[var(--text-secondary)] font-medium">
                      {selectedUser.lastActive
                        ? format(new Date(selectedUser.lastActive), "MMM d, yyyy, h:mm a")
                        : "No recent activity recorded"}
                    </span>
                  </div>
                </div>

                {/* Identity */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 dark:text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Identity &amp; Role</h4>
                  <div className="bg-gray-50 dark:bg-[var(--bg-canvas)] rounded-lg p-4 border border-gray-100 space-y-3">
                    <div className="flex items-center text-sm">
                      <Mail className="w-4 h-4 text-gray-400 dark:text-[var(--text-tertiary)] mr-3" />
                      <span className="text-gray-700 dark:text-[var(--text-secondary)]">{selectedUser.email}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Briefcase className="w-4 h-4 text-gray-400 dark:text-[var(--text-tertiary)] mr-3" />
                      <span className="text-gray-700 dark:text-[var(--text-secondary)]">{formatRole(selectedUser.role)} • {selectedUser.department || "Unassigned"}</span>
                    </div>
                  </div>
                </div>

                {/* Devices */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-gray-400 dark:text-[var(--text-tertiary)] uppercase tracking-widest">Known Devices</h4>
                    <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] bg-gray-100 dark:bg-[var(--bg-muted)] px-2 py-0.5 rounded-full">{selectedUser.devices?.length || 0}</span>
                  </div>
                  <div className="bg-white dark:bg-[var(--bg-surface)] border border-gray-200 dark:border-[var(--border-subtle)] rounded-lg overflow-hidden divide-y divide-gray-100">
                    {selectedUser.devices?.length > 0 ? (
                      selectedUser.devices.map((dev, idx) => (
                        <div key={idx} className="flex items-center p-3">
                          <MonitorSmartphone className="w-4 h-4 text-gray-400 dark:text-[var(--text-tertiary)] mr-3 shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-[var(--text-secondary)] truncate">{dev}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] italic p-4 text-center">No devices registered</p>
                    )}
                  </div>
                </div>

                {/* Global Status */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 dark:text-[var(--text-tertiary)] uppercase tracking-widest mb-3">Global Status</h4>
                  {selectedUser.internationalAccess ? (
                    <div className="flex items-start bg-amber-50 border border-amber-200 p-4 rounded-lg">
                      <Globe className="w-5 h-5 text-amber-500 mr-3 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-amber-900">International Clearance</p>
                        <p className="text-xs text-amber-700 mt-1">Authorized for access outside domestic IP ranges.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center p-3 text-sm text-gray-500 dark:text-[var(--text-tertiary)] bg-gray-50 dark:bg-[var(--bg-canvas)] rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
                      Domestic Only (Standard Protocol)
                    </div>
                  )}
                </div>

                {/* Accessible Vault Accounts */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-bold text-gray-400 dark:text-[var(--text-tertiary)] uppercase tracking-widest">Accessible Vault Accounts</h4>
                    <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] bg-gray-100 dark:bg-[var(--bg-muted)] px-2 py-0.5 rounded-full">{selectedUser.resources?.length || 0}</span>
                  </div>
                  <div className="bg-white dark:bg-[var(--bg-surface)] border border-gray-200 dark:border-[var(--border-subtle)] rounded-lg overflow-hidden divide-y divide-gray-100">
                    {selectedUser.resources?.length > 0 ? (
                      selectedUser.resources.map((res) => (
                        <div key={res.id} className="p-3">
                          {editingGrant === res.id ? (
                            /* ── Inline Edit Mode ── */
                            <div className="space-y-2">
                              <div className="flex items-center">
                                <Shield className="w-4 h-4 text-blue-500 mr-2 shrink-0" />
                                <span className="text-sm font-medium text-gray-800 dark:text-[var(--text-primary)] truncate">{res.name}</span>
                              </div>
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                                className="w-full text-xs border border-gray-300 dark:border-[var(--border-default)] rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                                  className="flex-1 text-xs bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-700 dark:text-[var(--text-secondary)] px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── View Mode ── */
                            <div className="flex justify-between items-center">
                              <div className="flex items-center truncate flex-1 min-w-0 mr-2">
                                <Shield className="w-4 h-4 text-gray-400 dark:text-[var(--text-tertiary)] mr-2 shrink-0" />
                                <div className="truncate">
                                  <span className="text-sm text-gray-700 dark:text-[var(--text-secondary)] truncate block">{res.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 ${ACCESS_TYPE_COLORS[res.accessType] || "bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-600 dark:text-[var(--text-secondary)]"}`}>
                                    <Clock className="w-2.5 h-2.5" />
                                    {ACCESS_TYPE_LABELS[res.accessType] || res.accessType}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openEditGrant(res.id, res.accessType)}
                                  className="p-1.5 text-gray-400 dark:text-[var(--text-tertiary)] hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Edit Access Type"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openRevokeModal(res.id, res.name)}
                                  className="p-1.5 text-gray-400 dark:text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
                      <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] italic p-4 text-center">No active vault resources allocated.</p>
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
          <div className="relative bg-white dark:bg-[var(--bg-surface)] rounded-xl shadow-2xl max-w-sm w-full p-6 z-10">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-[var(--text-primary)]">Revoke Access</h3>
                <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mb-6">
              Are you sure you want to revoke access to{" "}
              <span className="font-semibold text-gray-900 dark:text-[var(--text-primary)]">{revokeModal.accountName}</span>{" "}
              for{" "}
              <span className="font-semibold text-gray-900 dark:text-[var(--text-primary)]">{selectedUser?.name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRevokeModal(null)}
                disabled={revokeLoading}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] border border-gray-300 dark:border-[var(--border-default)] rounded-lg hover:bg-gray-50 dark:bg-[var(--bg-canvas)] transition-colors"
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
