import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import { Camera, Save, X, User, ShieldCheck, Smartphone, Trash2, QrCode, Lock, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import logo from "../assets/OrkaVault.png";
import { deletePrivateKey } from "../lib/webCryptoMfa";

export default function Profile() {
  const { user: authUser, fetchUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [departments, setDepartments] = useState([]);
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
  const [discordCode, setDiscordCode] = useState(null);
  const [discordCodeLoading, setDiscordCodeLoading] = useState(false);

  // MFA States
  const [mfaDevices, setMfaDevices] = useState([]);
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaStep, setMfaStep] = useState("idle"); // idle, setup, disable_confirm
  const [mfaError, setMfaError] = useState("");
  const [mfaSuccess, setMfaSuccess] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  const fetchMfaDevices = async () => {
    try {
      const { data } = await api.get("/auth/mfa/devices");
      setMfaDevices(data);
    } catch (e) {
      console.error("Failed to load MFA devices", e);
    }
  };

  const handleMfaSetup = async () => {
    setMfaLoading(true);
    setMfaError("");
    setMfaSuccess("");
    try {
      const { data } = await api.post("/auth/mfa/setup");
      setMfaSetupData(data);
      setMfaStep("setup");
    } catch (e) {
      setMfaError("Failed to initiate MFA setup.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaEnable = async (e) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError("");
    try {
      await api.post("/auth/mfa/enable", { code: totpCode });
      setMfaSuccess("MFA has been successfully enabled on your account.");
      setTotpCode("");
      setMfaStep("idle");
      setMfaSetupData(null);
      await fetchProfile();
      await fetchUser();
    } catch (e) {
      setMfaError(e.response?.data?.error || "Failed to enable MFA.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async (e) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError("");
    try {
      await api.post("/auth/mfa/disable", { code: totpCode });
      setMfaSuccess("MFA has been successfully disabled.");
      setTotpCode("");
      setMfaStep("idle");
      
      const mfaDeviceId = localStorage.getItem("mfaDeviceId");
      if (mfaDeviceId) {
        localStorage.removeItem("mfaDeviceId");
        try {
          await deletePrivateKey(mfaDeviceId);
        } catch (dbErr) {
          console.warn("Could not delete private key from IndexedDB", dbErr);
        }
      }

      await fetchProfile();
      await fetchUser();
    } catch (e) {
      setMfaError(e.response?.data?.error || "Failed to disable MFA.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    if (mfaDevices.length <= 1) {
      setMfaError("You need to set up a new MFA device before deleting the last one left.");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setMfaError(""), 6000);
      return;
    }
    try {
      await api.delete(`/auth/mfa/devices/${deviceId}`);
      setMfaSuccess("Device revoked successfully.");
      
      const currentDeviceId = localStorage.getItem("mfaDeviceId");
      if (currentDeviceId === deviceId) {
        localStorage.removeItem("mfaDeviceId");
        try {
          await deletePrivateKey(deviceId);
        } catch (dbErr) {
          console.warn("Could not delete private key from IndexedDB", dbErr);
        }
      }

      fetchMfaDevices();
      setTimeout(() => setMfaSuccess(""), 3000);
    } catch (e) {
      setMfaError("Failed to revoke device.");
    }
  };

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
    api
      .get("/departments")
      .then(({ data }) => setDepartments(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (profile?.mfaEnabled) {
      fetchMfaDevices();
    }
  }, [profile?.mfaEnabled]);

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

  const handleGenerateDiscordCode = async () => {
    setDiscordCodeLoading(true);
    try {
      const { data } = await api.post("/integrations/discord/link-code");
      setDiscordCode(data.code);
    } catch (e) {
      setError("Failed to generate a Discord link code.");
    } finally {
      setDiscordCodeLoading(false);
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
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-[var(--text-tertiary)]">
        Loading profile...
      </div>
    );

  const isMfaRequiredAndMissing = profile && !profile.mfaEnabled;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">
          {isMfaRequiredAndMissing ? "Security Verification Setup" : "My Profile"}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
          {isMfaRequiredAndMissing
            ? "Configure two-factor authentication to secure your vault access."
            : "Manage your personal information and preferences."}
        </p>
      </div>

      {isMfaRequiredAndMissing && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded shadow-sm">
          <p className="text-sm text-amber-800 font-semibold">
            Action Required: Two-Factor Authentication (MFA) Setup
          </p>
          <p className="text-xs text-amber-700 mt-1">
            To comply with OrkaVault security policies, all users must register an authenticator app. Scan the QR code below and input the generated code to continue.
          </p>
        </div>
      )}

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

      {!isMfaRequiredAndMissing && (
        <>
          {/* Avatar Section */}
          <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-sm border border-gray-200 dark:border-[var(--border-subtle)] p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider mb-4">
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
                    className="w-24 h-24 rounded-full object-contain ring-4 ring-gray-100 bg-white dark:bg-[var(--bg-surface)]"
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
                <p className="text-lg font-semibold text-gray-900 dark:text-[var(--text-primary)]">
                  {profile?.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">{profile?.email}</p>
                <span className="mt-1 inline-block bg-gray-100 dark:bg-[var(--bg-muted)] text-gray-700 dark:text-[var(--text-secondary)] text-xs px-2 py-1 rounded capitalize">
                  {profile?.role?.toLowerCase()}
                </span>
                {avatarUploading && (
                  <p className="text-xs text-brand-blue mt-1">Uploading...</p>
                )}
              </div>
            </div>
          </div>

          {/* Profile Info Section */}
          <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-sm border border-gray-200 dark:border-[var(--border-subtle)] p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider">
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
                    className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] hover:text-gray-700 dark:text-[var(--text-secondary)] font-medium flex items-center"
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
                <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                  Full Name
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                  />
                ) : (
                  <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">{profile?.name}</p>
                )}
              </div>

              {/* Email — read only always */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                  Email Address
                </label>
                <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">{profile?.email}</p>
                <p className="text-xs text-gray-400 dark:text-[var(--text-tertiary)] mt-0.5">
                  Email cannot be changed. Contact an admin if needed.
                </p>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                  Department
                </label>
                {editing ? (
                  <select
                    value={form.department}
                    onChange={(e) =>
                      setForm({ ...form, department: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                  >
                    {!form.department && <option value="">-- Select --</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">
                    {profile?.department || "Not set"}
                  </p>
                )}
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                  Start Date
                </label>
                {editing ? (
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                  />
                ) : (
                  <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">
                    {profile?.startDate
                      ? format(new Date(profile.startDate), "MMM d, yyyy")
                      : "Not set"}
                  </p>
                )}
              </div>

              {/* Read-only fields */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                  System Role
                </label>
                <p className="text-sm text-gray-900 dark:text-[var(--text-primary)] capitalize">
                  {profile?.role?.toLowerCase()}
                </p>
                <p className="text-xs text-gray-400 dark:text-[var(--text-tertiary)] mt-0.5">
                  Assigned by admin.
                </p>
              </div>

              {profile?.clearanceLevel && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                    Clearance Level
                  </label>
                  <p className="text-sm text-gray-900 dark:text-[var(--text-primary)]">{profile.clearanceLevel}</p>
                </div>
              )}
            </div>
          </div>

          {/* Change Password Section */}
          <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-sm border border-gray-200 dark:border-[var(--border-subtle)] p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider mb-6">
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
                  <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordForm.new}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                    className="w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
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
        </>
      )}

      {/* Two-Factor Authentication (MFA) Section */}
      <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-sm border border-gray-200 dark:border-[var(--border-subtle)] p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-blue" />
          Two-Factor Authentication (MFA)
        </h2>

        {mfaError && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-sm text-red-700">{mfaError}</p>
          </div>
        )}
        {mfaSuccess && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-sm text-green-700">{mfaSuccess}</p>
          </div>
        )}

        {profile?.mfaEnabled ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-md p-4">
              <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-green-800 dark:text-green-400">MFA is active on your account</h3>
                <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                  Your account is protected with a TOTP authenticator application (Google Authenticator, Authy, etc.).
                </p>
              </div>
            </div>

            {mfaStep === "disable_confirm" ? (
              <form onSubmit={handleMfaDisable} className="bg-gray-50 dark:bg-[var(--bg-muted)] border border-gray-200 dark:border-[var(--border-default)] rounded-md p-4 space-y-4">
                <div className="flex items-start gap-2 text-amber-600">
                  <ShieldAlert className="w-5 h-5 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Disable Two-Factor Authentication</h4>
                    <p className="text-xs text-gray-500 dark:text-[var(--text-secondary)] mt-0.5">
                      This lowers your account security. Enter the current code from your authenticator app to confirm.
                    </p>
                  </div>
                </div>

                <div className="max-w-xs space-y-3">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="Enter 6-digit code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-widest text-lg font-bold border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                    disabled={mfaLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={mfaLoading}
                      className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-md font-medium disabled:opacity-50"
                    >
                      {mfaLoading ? "Disabling..." : "Confirm Disable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMfaStep("idle");
                        setTotpCode("");
                        setMfaError("");
                      }}
                      className="text-xs text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] border border-gray-300 dark:border-[var(--border-default)] px-3 py-2 rounded-md font-medium"
                      disabled={mfaLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div>
                <button
                  onClick={() => setMfaStep("disable_confirm")}
                  className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-md font-medium"
                >
                  Disable MFA
                </button>
              </div>
            )}

            {/* Remembered Devices Sub-section */}
            <div className="pt-4 border-t border-gray-200 dark:border-[var(--border-subtle)]">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-gray-500" />
                Remembered Devices & Browsers
              </h3>
              <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] mb-4">
                These devices bypass MFA prompts using Web Crypto API cryptographic signatures stored locally in your browser.
              </p>

              {mfaDevices.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-[var(--text-tertiary)] italic">No remembered devices registered.</p>
              ) : (
                <div className="overflow-hidden border border-gray-200 dark:border-[var(--border-default)] rounded-md">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-default)]">
                    <thead className="bg-gray-50 dark:bg-[var(--bg-muted)]">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-[var(--text-secondary)]">Device / Browser</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-[var(--text-secondary)]">Registered</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-[var(--text-secondary)]">Last Used</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
                      {mfaDevices.map((dev) => (
                        <tr key={dev.id}>
                          <td className="px-4 py-2 text-xs font-medium text-gray-900 dark:text-[var(--text-primary)] flex items-center gap-2">
                            <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                            {dev.name}
                            {localStorage.getItem("mfaDeviceId") === dev.id && (
                              <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">Current</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-[var(--text-secondary)]">
                            {format(new Date(dev.createdAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-[var(--text-secondary)]">
                            {format(new Date(dev.lastUsedAt), "MMM d, HH:mm")}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => handleRevokeDevice(dev.id)}
                              className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                              title="Revoke Device"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)]">
              Two-factor authentication adds an extra layer of security to your account. In addition to your username and password, you will be prompted for a rotating 6-digit code.
            </p>

            {mfaStep === "setup" && mfaSetupData ? (
              <form onSubmit={handleMfaEnable} className="bg-gray-50 dark:bg-[var(--bg-muted)] border border-gray-200 dark:border-[var(--border-default)] rounded-md p-6 space-y-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="bg-white p-3 rounded-md border border-gray-200 shadow-sm flex-shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaSetupData.otpauth)}`}
                      alt="MFA QR Code"
                      className="w-40 h-40"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-primary)] flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-brand-blue" />
                      1. Scan the QR Code
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-[var(--text-secondary)]">
                      Open your authenticator app (like Google Authenticator, Authy, or Microsoft Authenticator) and scan the QR code.
                    </p>
                    <div className="pt-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Or enter key manually</p>
                      <code className="block select-all font-mono text-xs bg-white dark:bg-[var(--bg-surface)] border border-gray-300 dark:border-[var(--border-default)] px-2 py-1.5 rounded mt-1 break-all tracking-wider text-center text-brand-blue font-bold">
                        {mfaSetupData.secret}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-[var(--border-subtle)] space-y-3 max-w-sm">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-brand-blue" />
                    2. Verify Code to Enable
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-[var(--text-secondary)]">
                    Enter the current 6-digit code shown in your app to verify and activate MFA.
                  </p>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="123456"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-widest text-lg font-bold border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                    disabled={mfaLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={mfaLoading}
                      className="text-xs text-white bg-brand-blue hover:bg-blue-700 px-4 py-2 rounded-md font-medium disabled:opacity-50"
                    >
                      {mfaLoading ? "Enabling..." : "Verify & Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMfaStep("idle");
                        setTotpCode("");
                        setMfaSetupData(null);
                        setMfaError("");
                      }}
                      className="text-xs text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] border border-gray-300 dark:border-[var(--border-default)] px-4 py-2 rounded-md font-medium"
                      disabled={mfaLoading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div>
                <button
                  onClick={handleMfaSetup}
                  disabled={mfaLoading}
                  className="text-sm text-white bg-brand-blue hover:bg-blue-700 px-4 py-2 rounded-md font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  {mfaLoading ? "Starting Setup..." : "Set Up MFA"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {(authUser?.role === "MANAGER" || authUser?.role === "ADMIN") && (
        <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-sm border border-gray-200 dark:border-[var(--border-subtle)] p-6 mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Link Discord
          </h2>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-4">
            Linking your Discord account lets you approve or deny access requests directly from the
            Discord alert, without opening OrkaVault. Generate a code below, then run{" "}
            <code className="font-mono bg-gray-100 dark:bg-[var(--bg-muted)] px-1 rounded">
              /orkavault link &lt;code&gt;
            </code>{" "}
            in Discord within 10 minutes.
          </p>
          {discordCode && (
            <div className="mb-4 inline-flex items-center gap-2 bg-blue-50 border border-brand-blue rounded-md px-4 py-2">
              <span className="font-mono text-lg font-bold text-brand-blue tracking-widest">{discordCode}</span>
              <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">expires in 10 min</span>
            </div>
          )}
          <div>
            <button
              onClick={handleGenerateDiscordCode}
              disabled={discordCodeLoading}
              className="text-sm text-white bg-gray-800 hover:bg-gray-900 px-4 py-2 rounded-md font-medium disabled:opacity-50"
            >
              {discordCodeLoading ? "Generating..." : discordCode ? "Generate New Code" : "Generate Link Code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
