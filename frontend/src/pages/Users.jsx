import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { format } from "date-fns";
import { Check, Trash2, Edit2, X } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { CLEARANCE_TIERS } from "../lib/clearance";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [collections, setCollections] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editingUser, setEditingUser] = useState(null); // { id, name, email, role, endDate, ... }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { user: currentUser } = useAuth();

  const fetchUsersAndCollections = async () => {
    try {
      const [usersRes, collectionsRes, departmentsRes] = await Promise.all([
        api.get("/users"),
        api.get("/collections"),
        api.get("/departments"),
      ]);
      setUsers(usersRes.data);
      setCollections(collectionsRes.data);
      setDepartments(departmentsRes.data);
    } catch (e) {
      console.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndCollections();
  }, []);

  const handleApprove = async (id) => {
    try {
      await api.patch(`/users/${id}/approve`);
      await fetchUsersAndCollections();
    } catch (e) {
      alert("Failed to approve user");
    }
  };

  const handleDecline = async (id) => {
    try {
      await api.patch(`/users/${id}/decline`);
      await fetchUsersAndCollections();
    } catch (e) {
      alert("Failed to decline user");
    }
  };

  const handleDeactivate = async (id) => {
    if (
      !window.confirm(
        "Are you sure you want to deactivate this user and revoke all their grants?",
      )
    )
      return;
    try {
      await api.delete(`/users/${id}`);
      await fetchUsersAndCollections();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to deactivate user");
    }
  };

  const handleRoleChange = async (id, newRole) => {
    try {
      await api.patch(`/users/${id}/role`, { role: newRole });
      await fetchUsersAndCollections();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to change role");
    }
  };

  const handleDepartmentChange = async (id, newDepartment) => {
    try {
      await api.patch(`/users/${id}/profile`, { department: newDepartment });
      await fetchUsersAndCollections();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to change department");
    }
  };

  const openEditModal = (u) => {
    setEditingUser({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department || "",
      startDate: u.startDate ? new Date(u.startDate).toISOString().split("T")[0] : "",
      clearanceLevel: u.clearanceLevel || "",
      endDate: u.endDate ? new Date(u.endDate).toISOString().split("T")[0] : "",
      managedCollectionIds: u.managedCollections?.map(c => c.id) || [],
    });
  };

  const handleEditSave = async () => {
    try {
      const original = users.find((u) => u.id === editingUser.id);
      if (original.role !== editingUser.role) {
        await api.patch(`/users/${editingUser.id}/role`, { role: editingUser.role });
      }
      await api.patch(`/users/${editingUser.id}/enddate`, {
        endDate: editingUser.endDate || null,
      });
      // Update profile fields (department, startDate, clearanceLevel, managedCollections)
      await api.patch(`/users/${editingUser.id}/profile`, {
        department: editingUser.department, // Required field
        startDate: editingUser.startDate || null,
        clearanceLevel: editingUser.clearanceLevel || null,
        managedCollectionIds: editingUser.role === "MANAGER" ? editingUser.managedCollectionIds : [],
      });
      setEditingUser(null);
      await fetchUsersAndCollections();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to update user");
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableUsers = () => filteredUsers.filter((u) => u.id !== currentUser.id);

  const toggleSelectAll = () => {
    const selectable = selectableUsers();
    setSelectedIds((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((u) => u.id)),
    );
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await api.post("/users/bulk-delete", { userIds: [...selectedIds] });
      setSelectedIds(new Set());
      setBulkConfirmOpen(false);
      setBulkConfirmText("");
      await fetchUsersAndCollections();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to delete selected users");
    } finally {
      setBulkDeleting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = departmentFilter ? u.department === departmentFilter : true;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">Users & Roles</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
            Manage user access, approve registrations, and assign roles.
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue w-full sm:w-64"
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <span className="text-sm font-medium text-red-800">{selectedIds.size} user(s) selected</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-gray-600 dark:text-[var(--text-secondary)] hover:underline"
            >
              Clear
            </button>
            <button
              onClick={() => setBulkConfirmOpen(true)}
              className="btn btn-danger btn-sm"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Mobile: one card per user instead of a wide table */}
      <div className="row-cards md:hidden">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className={`row-card ${!u.active ? "bg-amber-50" : ""}`}>
              <div className="row-card-title flex items-center gap-2">
                {u.id !== currentUser.id && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-red focus:ring-brand-red"
                  />
                )}
                {u.name}
              </div>
              <div className="text-xs text-muted -mt-2 mb-2 truncate">{u.email}</div>

              <div className="row-card-field">
                <span className="rcf-label">Role</span>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  disabled={u.id === currentUser.id}
                  className="text-sm border-gray-300 dark:border-[var(--border-default)] rounded-md focus:ring-brand-blue focus:border-brand-blue disabled:opacity-50 disabled:bg-gray-100 dark:bg-[var(--bg-muted)]"
                >
                  <option value="USER">User</option>
                  <option value="MANAGER">Manager</option>
                  {u.role === "ADMIN" && <option value="ADMIN">Admin</option>}
                </select>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Department</span>
                <select
                  value={u.department || ""}
                  onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                  disabled={u.id === currentUser.id}
                  className="text-sm border-gray-300 dark:border-[var(--border-default)] rounded-md focus:ring-brand-blue focus:border-brand-blue disabled:opacity-50 disabled:bg-gray-100 dark:bg-[var(--bg-muted)]"
                >
                  <option value="">-- Not set --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Status</span>
                <span className="rcf-value">
                  {u.revoked ? (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium">Access Revoked</span>
                  ) : u.active ? (
                    <span className="bg-green-100 text-brand-green px-2 py-1 rounded-full text-xs font-medium">Active</span>
                  ) : (
                    <span className="bg-amber-100 text-brand-amber px-2 py-1 rounded-full text-xs font-medium">Pending Approval</span>
                  )}
                </span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">Joined</span>
                <span className="rcf-value">{format(new Date(u.createdAt), "MMM d, yyyy, h:mm a")}</span>
              </div>
              <div className="row-card-field">
                <span className="rcf-label">End Date</span>
                <span className="rcf-value">{u.endDate ? format(new Date(u.endDate), "MMM d, yyyy") : "—"}</span>
              </div>

              {!u.active && !u.revoked && (
                <div className="row-card-actions">
                  <button onClick={() => handleApprove(u.id)} className="btn btn-success btn-sm flex-1">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => handleDecline(u.id)} className="btn btn-danger btn-sm flex-1">
                    <X className="h-4 w-4" /> Decline
                  </button>
                </div>
              )}
              {u.active && !u.revoked && u.id !== currentUser.id && (
                <div className="row-card-actions">
                  <button onClick={() => openEditModal(u)} className="btn btn-secondary btn-sm flex-1">
                    <Edit2 className="h-4 w-4" /> Edit
                  </button>
                  <button onClick={() => handleDeactivate(u.id)} className="btn btn-danger btn-sm flex-1">
                    <Trash2 className="h-4 w-4" /> Deactivate
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-[var(--bg-surface)] shadow rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === selectableUsers().length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-red focus:ring-brand-red"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">
                End Date
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
                  colSpan="8"
                  className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  Loading...
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className={!u.active ? "bg-amber-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {u.id !== currentUser.id && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-red focus:ring-brand-red"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">
                      {u.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === currentUser.id}
                      className="text-sm border-gray-300 dark:border-[var(--border-default)] rounded-md focus:ring-brand-blue focus:border-brand-blue disabled:opacity-50 disabled:bg-gray-100 dark:bg-[var(--bg-muted)]"
                    >
                      <option value="USER">User</option>
                      <option value="MANAGER">Manager</option>
                      {u.role === "ADMIN" && <option value="ADMIN">Admin</option>}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={u.department || ""}
                      onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                      disabled={u.id === currentUser.id}
                      className="text-sm border-gray-300 dark:border-[var(--border-default)] rounded-md focus:ring-brand-blue focus:border-brand-blue disabled:opacity-50 disabled:bg-gray-100 dark:bg-[var(--bg-muted)]"
                    >
                      <option value="">-- Not set --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {u.revoked ? (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-medium">
                        Access Revoked
                      </span>
                    ) : u.active ? (
                      <span className="bg-green-100 text-brand-green px-2 py-1 rounded-full text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-brand-amber px-2 py-1 rounded-full text-xs font-medium">
                        Pending Approval
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {format(new Date(u.createdAt), "MMM d, yyyy, h:mm a")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                    {u.endDate ? format(new Date(u.endDate), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {!u.active && !u.revoked && (
                      <>
                        <button
                          onClick={() => handleApprove(u.id)}
                          className="text-brand-green hover:text-green-700 inline-flex"
                          title="Approve"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDecline(u.id)}
                          className="text-brand-red hover:text-red-700 inline-flex ml-2"
                          title="Decline"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {u.active && !u.revoked && u.id !== currentUser.id && (
                      <>
                        <button
                          onClick={() => openEditModal(u)}
                          className="text-brand-blue hover:text-blue-700 inline-flex"
                          title="Edit User"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(u.id)}
                          className="text-brand-red hover:text-red-700 inline-flex ml-2"
                          title="Deactivate"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {u.revoked && (
                      <span className="text-gray-500 dark:text-[var(--text-tertiary)] italic text-xs">
                        Access Revoked
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setEditingUser(null)}
            />
            <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-xl sm:my-8">
              <div className="flex justify-between items-center mb-5 border-b pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-[var(--text-primary)]">
                  Edit User
                </h3>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-400 dark:text-[var(--text-tertiary)] hover:text-gray-500 dark:text-[var(--text-tertiary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Name
                  </label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-[var(--text-primary)] bg-gray-50 dark:bg-[var(--bg-canvas)] px-3 py-2 rounded-md">
                    {editingUser.name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Email
                  </label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-[var(--text-primary)] bg-gray-50 dark:bg-[var(--bg-canvas)] px-3 py-2 rounded-md">
                    {editingUser.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Role
                  </label>
                  <select
                    value={editingUser.role}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, role: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="USER">User</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Department
                  </label>
                  <select
                    value={editingUser.department}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, department: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="">-- Not set --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {editingUser.role === "MANAGER" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">
                      Managed Collections
                    </label>
                    <div className="bg-gray-50 dark:bg-[var(--bg-canvas)] p-3 rounded-md border border-gray-200 dark:border-[var(--border-subtle)] max-h-40 overflow-y-auto space-y-2">
                      {collections.map(c => (
                        <label key={c.id} className="flex items-center space-x-2 text-sm">
                          <input 
                            type="checkbox"
                            checked={editingUser.managedCollectionIds.includes(c.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked 
                                ? [...editingUser.managedCollectionIds, c.id]
                                : editingUser.managedCollectionIds.filter(id => id !== c.id);
                              setEditingUser({...editingUser, managedCollectionIds: newIds});
                            }}
                            className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-blue focus:ring-brand-blue"
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                      {collections.length === 0 && (
                        <span className="text-gray-500 dark:text-[var(--text-tertiary)] italic text-xs">No collections exist yet.</span>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editingUser.startDate}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, startDate: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    Clearance Level
                  </label>
                  <select
                    value={editingUser.clearanceLevel}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, clearanceLevel: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="">-- Not set --</option>
                    {CLEARANCE_TIERS.map((tier) => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    End Date (for offboarding)
                  </label>
                  <input
                    type="date"
                    value={editingUser.endDate}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        endDate: e.target.value,
                      })
                    }
                    className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                </div>
              </div>

              <div className="mt-5 pt-4 border-t sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleEditSave}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-[var(--border-default)] shadow-sm px-4 py-2 bg-white dark:bg-[var(--bg-surface)] text-base font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation — requires typing "approve" */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => { setBulkConfirmOpen(false); setBulkConfirmText(""); }}
            />
            <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-xl sm:my-8">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-[var(--text-primary)] mb-2">
                Delete {selectedIds.size} user(s)?
              </h3>
              <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mb-4">
                These users will be deactivated and all their access grants revoked. This action is logged
                to the immutable audit log. Type <span className="font-mono font-semibold">approve</span> to
                confirm.
              </p>
              <input
                type="text"
                autoFocus
                value={bulkConfirmText}
                onChange={(e) => setBulkConfirmText(e.target.value)}
                placeholder="approve"
                className="block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 focus:outline-none focus:ring-brand-red focus:border-brand-red sm:text-sm mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setBulkConfirmOpen(false); setBulkConfirmText(""); }}
                  className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkConfirmText.trim().toLowerCase() !== "approve" || bulkDeleting}
                  onClick={handleBulkDelete}
                  className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-red hover:bg-red-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
