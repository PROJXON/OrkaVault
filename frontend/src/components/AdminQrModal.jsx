import React, { useState } from "react";
import { QrCode, X } from "lucide-react";
import api from "../lib/api";

// ADMIN-only: view the raw authenticator QR code image that was uploaded
// for this account (e.g. to re-provision a new device). Everyone else
// only ever sees the generated OTP (RevealOtp) — never the underlying
// QR/secret itself.
export default function AdminQrModal({ accountId }) {
  const [open, setOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpen = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/accounts/${accountId}/reveal-qr`);
      setQrCodeBase64(data.qrCodeBase64);
      setOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load QR code");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setQrCodeBase64(null);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={loading}
        className="text-gray-400 hover:text-brand-blue disabled:opacity-50"
        title="View Authenticator QR Code (Admin)"
      >
        <QrCode className="w-4 h-4" />
      </button>
      {error && <span className="text-xs text-brand-red ml-1">{error}</span>}

      {open && qrCodeBase64 && (
        <div className="scrim" onClick={handleClose}>
          <div className="modal text-center relative" style={{ maxWidth: 380, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleClose}
              className="iconbtn absolute top-4 right-4"
              style={{ width: 32, height: 32 }}
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Authenticator QR Code</h3>
            <div
              className="flex justify-center"
              onCopy={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <img
                src={qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                alt="TOTP QR Code"
                className="w-48 h-48 select-none bg-white rounded-sm"
                style={{ userSelect: "none", WebkitUserSelect: "none" }}
                draggable={false}
              />
            </div>
            <p className="mt-4 text-xs text-muted">Admin only. Scan to re-provision a new device. Do not screenshot.</p>
          </div>
        </div>
      )}
    </>
  );
}
