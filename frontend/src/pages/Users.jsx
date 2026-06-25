import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { format } from "date-fns";
import { Check, Trash2, Edit2, X } from "lucide-react";
import { useAuth } from "../lib/authContext";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editingUser, setEditingUser] = useState(null); // { id, name, email, role, endDate, ... }
  const { user: currentUser } = useAuth();

  const fetchUsersAndCollections = async () => {
    try {
      const [usersRes, collectionsRes] = await Promise.all([
        api.get("/users"),
        api.get("/collections")
      ]);
      setUsers(usersRes.data);
      setCollections(collectionsRes.data);
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
          <h1 className="text-2xl font-bold text-gray-900">Users & Roles</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage user access, approve registrations, and assign roles.
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue w-full sm:w-64"
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
          >
            <option value="">All Departments</option>
            {["IT","HR","Marketing","Business","GAP","Operation","Staff","Executive"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Joined
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
                  colSpan="6"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  Loading...
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr key={u.id} className={!u.active ? "bg-amber-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {u.name}
                    </div>
                    <div className="text-sm text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === currentUser.id}
                      className="text-sm border-gray-300 rounded-md focus:ring-brand-blue focus:border-brand-blue disabled:opacity-50 disabled:bg-gray-100"
                    >
                      <option value="USER">User</option>
                      <option value="MANAGER">Manager</option>
                      {u.role === "ADMIN" && <option value="ADMIN">Admin</option>}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {u.department || "-"}
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(u.createdAt), "MMM d, yyyy, h:mm a")}
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
                      <span className="text-gray-500 italic text-xs">
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

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setEditingUser(null)}
            />
            <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
              <div className="flex justify-between items-center mb-5 border-b pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Edit User
                </h3>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                    {editingUser.name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                    {editingUser.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    value={editingUser.role}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, role: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="USER">User</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Department
                  </label>
                  <select
                    value={editingUser.department}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, department: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="">-- Not set --</option>
                    {["IT","HR","Marketing","Business","GAP","Operation","Staff","Executive"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {editingUser.role === "MANAGER" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Managed Collections
                    </label>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200 max-h-40 overflow-y-auto space-y-2">
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
                            className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                      {collections.length === 0 && (
                        <span className="text-gray-500 italic text-xs">No collections exist yet.</span>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editingUser.startDate}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, startDate: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Clearance Level
                  </label>
                  <select
                    value={editingUser.clearanceLevel}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, clearanceLevel: e.target.value })
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  >
                    <option value="">-- Not set --</option>
                    <option value="Tier 1 - Standard">Tier 1 - Standard</option>
                    <option value="Tier 2 - Elevated">Tier 2 - Elevated</option>
                    <option value="Tier 3 - Executive">Tier 3 - Executive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
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
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
