import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import { Camera, Save, X, User } from "lucide-react";
import { format } from "date-fns";
import logo from "../assets/OrkaVault.png";

const DEPARTMENTS = [
  "IT",
  "HR",
  "Marketing",
  "Business",
  "GAP",
  "Operation",
  "Staff",
  "Executive",
];

export default function Profile() {
  const { user: authUser, fetchUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", startDate: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get("/profile/me");
      setProfile(data);
      setForm({
        name: data.name || "",
        department: data.department || "",
        startDate: data.startDate
          ? new Date(data.startDate).toISOString().split("T")[0]
          : "",
      });
    } catch (e) {
      setError("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch("/profile/me", form);
      await fetchProfile();
      await fetchUser(); // refresh auth context so sidebar name updates
      setEditing(false);
      setSuccess("Profile updated successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const { data } = await api.post("/profile/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
      await fetchUser();
    } catch (e) {
      setError("Failed to upload photo. Max size is 5MB.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (passwordForm.new.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { data } = await api.patch("/profile/password", {
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new,
      });
      setPasswordSuccess(data.message);
      setPasswordForm({ current: "", new: "", confirm: "" });
      setTimeout(() => setPasswordSuccess(""), 3000);
    } catch (e) {
      setPasswordError(e.response?.data?.error || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const getInitials = (name) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2) || "?";

  const apiBaseUrl = api.defaults.baseURL || "";
  const serverOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  const getAvatarSrc = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${serverOrigin}${url}`;
  };

  const avatarSrc = getAvatarSrc(profile?.avatarUrl);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading profile...
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your personal information and preferences.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Avatar Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          Profile Photo
        </h2>
        <div className="flex items-center space-x-6">
          <div className="relative">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover ring-4 ring-gray-100"
              />
            ) : (
              <img
                src={logo}
                alt="Default Avatar"
                className="w-24 h-24 rounded-full object-contain ring-4 ring-gray-100 bg-white"
              />
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 w-8 h-8 bg-brand-blue rounded-full flex items-center justify-center text-white hover:bg-blue-700 shadow-md disabled:opacity-50"
              title="Upload photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {profile?.name}
            </p>
            <p className="text-sm text-gray-500">{profile?.email}</p>
            <span className="mt-1 inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded capitalize">
              {profile?.role?.toLowerCase()}
            </span>
            {avatarUploading && (
              <p className="text-xs text-brand-blue mt-1">Uploading...</p>
            )}
          </div>
        </div>
      </div>

      {/* Profile Info Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Personal Information
          </h2>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-brand-blue hover:text-blue-700 font-medium"
            >
              Edit
            </button>
          ) : (
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setEditing(false);
                  setError("");
                  // Reset form to current profile
                  setForm({
                    name: profile?.name || "",
                    department: profile?.department || "",
                    startDate: profile?.startDate
                      ? new Date(profile.startDate).toISOString().split("T")[0]
                      : "",
                  });
                }}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center"
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm text-white bg-brand-blue hover:bg-blue-700 px-3 py-1.5 rounded-md font-medium flex items-center disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Name */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              Full Name
            </label>
            {editing ? (
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              />
            ) : (
              <p className="text-sm text-gray-900">{profile?.name}</p>
            )}
          </div>

          {/* Email — read only always */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              Email Address
            </label>
            <p className="text-sm text-gray-900">{profile?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Email cannot be changed. Contact an admin if needed.
            </p>
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              Department
            </label>
            {editing ? (
              <select
                value={form.department}
                onChange={(e) =>
                  setForm({ ...form, department: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-900">
                {profile?.department || "Not set"}
              </p>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              Start Date
            </label>
            {editing ? (
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              />
            ) : (
              <p className="text-sm text-gray-900">
                {profile?.startDate
                  ? format(new Date(profile.startDate), "MMM d, yyyy")
                  : "Not set"}
              </p>
            )}
          </div>

          {/* Read-only fields */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
              System Role
            </label>
            <p className="text-sm text-gray-900 capitalize">
              {profile?.role?.toLowerCase()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Assigned by admin.
            </p>
          </div>

          {profile?.clearanceLevel && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Clearance Level
              </label>
              <p className="text-sm text-gray-900">{profile.clearanceLevel}</p>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-6">
          Security Settings
        </h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          {passwordError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-sm text-red-700">{passwordError}</p>
            </div>
          )}
          {passwordSuccess && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
              <p className="text-sm text-green-700">{passwordSuccess}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-4 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.current}
                onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.new}
                onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              />
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordSaving}
                className="text-sm text-white bg-gray-800 hover:bg-gray-900 px-4 py-2 rounded-md font-medium disabled:opacity-50"
              >
                {passwordSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
