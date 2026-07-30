import React, { useState, useEffect } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import { CLEARANCE_TIERS } from "../lib/clearance";

export default function EditEntryModal({ isOpen, onClose, onSuccess, account, collections }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    platformType: "THIRD_PARTY",
    password: "", // Blank by default, only sent if changed
    notes: "",
    collectionId: "",
    refreshCycle: "FOUR_MONTHS",
    totpQrBase64: "", // Optional, only updated if set
    isGoogleSSO: false,
    requiredClearance: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requireTotpQr, setRequireTotpQr] = useState(true);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        username: account.username,
        platformType: account.platformType,
        refreshCycle: account.refreshCycle,
        notes: account.notes || "",
        collectionId: account.collectionId || "",
        password: "", // leave blank unless editing
        totpQrBase64: "", // start blank, will be uploaded if needed
        isGoogleSSO: account.isGoogleSSO || false,
        requiredClearance: account.requiredClearance || "",
      });
      api
        .get("/policies")
        .then(({ data }) => {
          const policy = data.find((p) => p.name === "REQUIRE_TOTP_QR");
          setRequireTotpQr(!policy || policy.value !== "false");
        })
        .catch(() => setRequireTotpQr(true));
    }
  }, [account]);

  if (!isOpen || !account) return null;

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
        return handleGeneratePassword(); // recursive retry
    }
    setFormData({ ...formData, password: generated });
    setShowPassword(true);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      requireTotpQr &&
      formData.platformType === "GOOGLE_WORKSPACE" &&
      !account.hasTotpQr &&
      !formData.totpQrBase64
    ) {
      setError("An Authenticator QR Code is required for Google Workspace accounts.");
      return;
    }

    setLoading(true);
    setError("");

    // Only send password if they typed a new one
    const payload = { ...formData };
    if (!payload.password) {
      delete payload.password;
    }
    if (!payload.totpQrBase64) {
      delete payload.totpQrBase64;
    }

    try {
      await api.patch(`/accounts/${account.id}`, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update entry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-h">
            <div className="mt grow">Edit Vault Entry</div>
            <button onClick={onClose} className="iconbtn" style={{ width: 32, height: 32 }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="modal-b">
            {error && (
              <div className="p-3 text-sm rounded-sm" style={{ color: "var(--error-text)", background: "var(--error-subtle)", border: "1px solid var(--error-border)" }}>
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="input mt-1"
                  placeholder="e.g. HubSpot CRM"
                />
              </div>
              <div>
                <label className="field-label">
                  Platform Type
                </label>
                <select
                  value={formData.platformType}
                  onChange={(e) =>
                    setFormData({ ...formData, platformType: e.target.value })
                  }
                  className="input mt-1"
                >
                  <option value="THIRD_PARTY">Third Party Tool</option>
                  <option value="GOOGLE_WORKSPACE">Google Workspace</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">
                  Collection (Optional)
                </label>
                <select
                  value={formData.collectionId}
                  onChange={(e) =>
                    setFormData({ ...formData, collectionId: e.target.value })
                  }
                  className="select mt-1"
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
                <label className="field-label">
                  Username / Email
                </label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  className="input mt-1"
                />
              </div>
              <div>
                <label className="field-label">
                  Rotation Cycle
                </label>
                <select
                  value={formData.refreshCycle}
                  onChange={(e) =>
                    setFormData({ ...formData, refreshCycle: e.target.value })
                  }
                  className="input mt-1"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="FOUR_MONTHS">Every 4 Months</option>
                  <option value="ANNUALLY">Annually</option>
                  <option value="MANUAL">Manual Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="field-label">
                Required Clearance{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={formData.requiredClearance}
                onChange={(e) =>
                  setFormData({ ...formData, requiredClearance: e.target.value })
                }
                className="input mt-1"
              >
                <option value="">-- No requirement --</option>
                {CLEARANCE_TIERS.map((tier) => (
                  <option key={tier} value={tier}>{tier}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 mt-4 text-sm" style={{ color: "var(--text-primary)" }}>
              <input
                id="isGoogleSSO"
                type="checkbox"
                checked={formData.isGoogleSSO}
                onChange={(e) => setFormData({ ...formData, isGoogleSSO: e.target.checked, password: "" })}
                className="h-4 w-4 rounded-sm"
                style={{ accentColor: "var(--brand)" }}
              />
              Sign in via Google Account (No password required)
            </label>

            {!formData.isGoogleSSO && (
              <div>
                <label className="field-label">
                  New Password <span className="text-gray-400 font-normal">(Leave blank to keep current)</span>
                </label>
                <div className="mt-1 flex space-x-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="input"
                      style={{ paddingRight: 40 }}
                      placeholder="Type new password..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      style={{ color: "var(--text-tertiary)" }}
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
                    className="btn btn-secondary btn-sm"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="field-label">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="input mt-1"
                placeholder="Optional notes, URLs, or MFA backup codes..."
                rows={2}
              />
            </div>

            <div>
              <label className="field-label mb-1">
                Authenticator QR Code{" "}
                {formData.platformType === "GOOGLE_WORKSPACE" && requireTotpQr && !account.hasTotpQr ? (
                  <span className="text-brand-red">(Required)</span>
                ) : (
                  <span className="text-gray-400">(Upload new to replace)</span>
                )}
              </label>
              <div className="flex items-center flex-wrap gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="text-sm max-w-full"
                  style={{ color: "var(--text-tertiary)" }}
                />
                {formData.totpQrBase64 ? (
                  <div className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--success-text)" }}>
                    New image selected
                  </div>
                ) : account.hasTotpQr ? (
                  <div className="text-xs font-medium whitespace-nowrap text-gray-400">
                    Existing QR code on file — will be kept
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? "Saving..." : "Save Vault"}
              </button>
            </div>
          </form>
        </div>
    </div>
  );
}
