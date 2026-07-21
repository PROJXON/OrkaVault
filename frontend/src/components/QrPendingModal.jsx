import React from "react";
import { X, ShieldAlert } from "lucide-react";
import QrUploadList from "./QrUploadList";

// Persistent counterpart to BulkImportModal's inline QR follow-up — for
// accounts that were left pending (modal closed early, or the QR wasn't
// on hand yet at import time). Pending here is derived structurally
// (GOOGLE_WORKSPACE, not SSO, no totpQrBase64), not from the notes-text
// marker, so it also catches accounts created individually while the
// REQUIRE_TOTP_QR policy was toggled off.
export default function QrPendingModal({ isOpen, onClose, accounts, onSuccess }) {
  if (!isOpen) return null;

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
              QR Codes Pending
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing pending — every Google Workspace entry has a QR code.
            </p>
          ) : (
            <div className="p-3 rounded-md bg-yellow-50 text-yellow-800 text-sm">
              <p className="flex items-start font-medium mb-2">
                <ShieldAlert className="w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                {accounts.length} Google Workspace{" "}
                {accounts.length === 1 ? "entry is" : "entries are"} missing a TOTP QR code.
              </p>
              <QrUploadList accounts={accounts} onSaved={onSuccess} />
            </div>
          )}

          <div className="mt-5 pt-4 border-t flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md hover:bg-blue-700 focus:outline-none"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
