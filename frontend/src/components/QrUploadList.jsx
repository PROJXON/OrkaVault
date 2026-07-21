import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import api from "../lib/api";

// Shared by BulkImportModal (right after an import) and QrPendingModal
// (any time later) — both just hand it a flat [{id, name}] list of
// accounts missing a TOTP QR and let it handle staging + saving.
export default function QrUploadList({ accounts, onSaved }) {
  const [qrFiles, setQrFiles] = useState({});
  const [savedQrIds, setSavedQrIds] = useState(new Set());
  const [qrSaving, setQrSaving] = useState(false);
  const [qrError, setQrError] = useState("");

  const handleQrFileChange = (accountId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setQrFiles((prev) => ({ ...prev, [accountId]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveQrCodes = async () => {
    const updates = Object.entries(qrFiles).map(([accountId, totpQrBase64]) => ({
      accountId,
      totpQrBase64,
    }));
    if (updates.length === 0) return;
    setQrSaving(true);
    setQrError("");
    try {
      const { data } = await api.patch("/accounts/bulk-qr", { updates });
      const newlySaved = new Set(savedQrIds);
      data.results.forEach((r) => {
        if (r.status === "updated") newlySaved.add(r.accountId);
      });
      setSavedQrIds(newlySaved);
      setQrFiles((prev) => {
        const next = { ...prev };
        newlySaved.forEach((id) => delete next[id]);
        return next;
      });
      if (data.failed > 0) {
        setQrError(`${data.failed} QR code${data.failed === 1 ? "" : "s"} failed to save.`);
      }
      if (onSaved) onSaved(data);
    } catch (err) {
      setQrError(err.response?.data?.error || "Failed to save QR codes.");
    } finally {
      setQrSaving(false);
    }
  };

  const qrFilesStagedCount = Object.keys(qrFiles).length;

  return (
    <div>
      <div className="space-y-2">
        {accounts.map((a) => {
          const isSaved = savedQrIds.has(a.id);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between bg-white rounded-md border border-yellow-200 px-3 py-2"
            >
              <span className="truncate mr-2 text-gray-900">{a.name}</span>
              {isSaved ? (
                <span className="flex items-center text-brand-green text-xs font-medium whitespace-nowrap shrink-0">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Saved
                </span>
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleQrFileChange(a.id, e.target.files?.[0])}
                  className="max-w-[60%] text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-brand-blue file:text-white hover:file:bg-blue-700"
                />
              )}
            </div>
          );
        })}
      </div>
      {qrError && <p className="text-brand-red text-xs mt-2">{qrError}</p>}
      <button
        type="button"
        onClick={handleSaveQrCodes}
        disabled={qrSaving || qrFilesStagedCount === 0}
        className="mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none disabled:opacity-50"
      >
        {qrSaving
          ? "Saving..."
          : `Save QR Code${qrFilesStagedCount === 1 ? "" : "s"}${
              qrFilesStagedCount ? ` (${qrFilesStagedCount})` : ""
            }`}
      </button>
    </div>
  );
}
