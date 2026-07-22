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
    <div className="scrim" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-h">
            <div className="mt grow">QR Codes Pending</div>
            <button onClick={onClose} className="iconbtn" style={{ width: 32, height: 32 }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="modal-b">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing pending — every Google Workspace entry has a QR code.
            </p>
          ) : (
            <div className="p-3 rounded-md text-sm" style={{ background: "var(--warning-subtle)", color: "var(--warning-text)" }}>
              <p className="flex items-start font-medium mb-2">
                <ShieldAlert className="w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                {accounts.length} Google Workspace{" "}
                {accounts.length === 1 ? "entry is" : "entries are"} missing a TOTP QR code.
              </p>
              <QrUploadList accounts={accounts} onSaved={onSuccess} />
            </div>
          )}
          </div>

          <div className="modal-f">
            <button type="button" onClick={onClose} className="btn btn-primary">Done</button>
          </div>
        </div>
    </div>
  );
}
