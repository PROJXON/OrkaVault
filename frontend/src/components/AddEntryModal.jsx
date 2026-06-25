import React, { useState, useEffect } from "react";
import { X, ShieldAlert, Eye, EyeOff } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";

export default function AddEntryModal({ isOpen, onClose, onSuccess, collections }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    platformType: "THIRD_PARTY",
    password: "",
    notes: "",
    collectionId: "",
    refreshCycle: "SIX_MONTHS",
    totpQrBase64: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: "",
        username: "",
        platformType: "THIRD_PARTY",
        password: "",
        notes: "",
        collectionId: "",
        refreshCycle: "SIX_MONTHS",
        totpQrBase64: "",
      });
      setError("");
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isAdmin = user?.role === "ADMIN";

  const handleGeneratePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let generated = "";
    for (let i = 0; i < 16; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure at least one uppercase, lowercase, number, and special char
    const hasUpper = /[A-Z]/.test(generated);
    const hasLower = /[a-z]/.test(generated);
    const hasNum = /[0-9]/.test(generated);
    const hasSpec = /[^A-Za-z0-9]/.test(generated);
    if (!hasUpper || !hasLower || !hasNum || !hasSpec) {
      return handleGeneratePassword(); // recursive retry if it doesn't meet criteria
    }
    setFormData({ ...formData, password: generated });
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // BUG 4 Defense triggers on backend 409
      await api.post("/accounts", formData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit entry");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, totpQrBase64: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        <div className="relative inline-block w-full max-w-lg p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
          <div className="flex justify-between items-center mb-5 border-b pb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Add New Vault Entry
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isAdmin && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-md flex items-start">
              <ShieldAlert className="w-5 h-5 mr-2 shrink-0 text-brand-blue" />
              <p>
                New entries will be submitted to the QA queue for admin review
                before becoming active.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-brand-red bg-red-50 rounded border border-red-100">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  placeholder="e.g. HubSpot CRM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Platform Type
                </label>
                <select
                  value={formData.platformType}
                  onChange={(e) =>
                    setFormData({ ...formData, platformType: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                >
                  <option value="THIRD_PARTY">Third Party Tool</option>
                  <option value="GOOGLE_WORKSPACE">Google Workspace</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">
                  Collection (Optional)
                </label>
                <select
                  value={formData.collectionId}
                  onChange={(e) =>
                    setFormData({ ...formData, collectionId: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                >
                  <option value="">None</option>
                  {collections?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Username / Email
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rotation Cycle
                </label>
                <select
                  value={formData.refreshCycle}
                  onChange={(e) =>
                    setFormData({ ...formData, refreshCycle: e.target.value })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="SIX_MONTHS">Every 6 Months</option>
                  <option value="ANNUALLY">Annually</option>
                  <option value="MANUAL">Manual Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 flex space-x-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="block w-full border border-gray-300 rounded-md py-2 px-3 pr-10 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                >
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                placeholder="Optional notes, URLs, or MFA backup codes..."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Authenticator QR Code
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-blue file:text-white hover:file:bg-blue-700"
                />
                {formData.totpQrBase64 && (
                  <div className="text-xs text-brand-green font-medium whitespace-nowrap">
                    Image uploaded
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                {isAdmin ? "Add to Vault" : "Submit to QA"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
