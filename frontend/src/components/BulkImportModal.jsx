import React, { useState } from "react";
import { X, UploadCloud, Download, CheckCircle, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import QrUploadList from "./QrUploadList";

const TEMPLATE_CSV = `name,username,platformType,password,isGoogleSSO,refreshCycle,notes,collection
Slack Workspace,ops@example.com,THIRD_PARTY,Str0ng!Passw0rd#1,false,FOUR_MONTHS,Shared team workspace,
Stripe,billing@example.com,THIRD_PARTY,An0ther$ecurePass2,false,MONTHLY,,Billing
Google Workspace Admin,admin@example.com,GOOGLE_WORKSPACE,,false,SIX_MONTHS,QR code to be uploaded after import,
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vault-entries-template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function BulkImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const reset = () => {
    setFile(null);
    setError("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/accounts/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (data.created > 0) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to import CSV.");
    } finally {
      setLoading(false);
    }
  };

  const failedRows = result?.results?.filter((r) => r.status === "error") || [];
  const qrPendingRows = result?.results?.filter((r) => r.status === "created" && r.qrPending) || [];

  return (
    <div className="scrim" onClick={handleClose}>
        <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-h">
            <div className="mt grow">Bulk Import Vault Entries</div>
            <button onClick={handleClose} className="iconbtn" style={{ width: 32, height: 32 }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="modal-b">
          <div className="p-3 text-sm rounded-md" style={{ background: "var(--brand-subtle)", color: "var(--brand-text)" }}>
            <p>
              Upload a CSV of vault entries. Google Workspace rows are
              imported without a TOTP QR code — you can attach those right
              here once the import finishes. A{" "}
              <span className="font-medium">collection</span> name that
              doesn't exist yet is created automatically.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="mt-2 inline-flex items-center font-medium"
            >
              <Download className="w-4 h-4 mr-1" />
              Download CSV template
            </button>
          </div>

          {error && (
            <div className="p-3 text-sm rounded" style={{ color: "var(--error-text)", background: "var(--error-subtle)", border: "1px solid var(--error-border)" }}>
              {error}
            </div>
          )}

          {!result && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="field">
                <span className="field-label">CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="text-sm mt-1"
                  style={{ color: "var(--text-tertiary)" }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <button type="button" onClick={handleClose} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={loading || !file} className="btn btn-primary">
                  <UploadCloud className="w-4 h-4" />
                  {loading ? "Importing..." : "Import"}
                </button>
              </div>
            </form>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center p-3 rounded-md text-sm" style={{ background: "var(--success-subtle)", color: "var(--success-text)" }}>
                <CheckCircle className="w-5 h-5 mr-2 shrink-0" />
                {result.created} of {result.results.length} row
                {result.results.length === 1 ? "" : "s"} imported.
              </div>

              {qrPendingRows.length > 0 && (
                <div className="p-3 rounded-md text-sm" style={{ background: "var(--warning-subtle)", color: "var(--warning-text)" }}>
                  <p className="font-medium mb-2">
                    {qrPendingRows.length} Google Workspace{" "}
                    {qrPendingRows.length === 1 ? "entry needs" : "entries need"} a QR code —
                    attach them below, no need to open Edit for each one. If you close this
                    without finishing, they'll still show up under{" "}
                    <span className="font-medium">QR Codes Pending</span> on the vault page.
                  </p>
                  <QrUploadList
                    accounts={qrPendingRows.map((r) => ({ id: r.id, name: r.name }))}
                    onSaved={onSuccess}
                  />
                </div>
              )}

              {failedRows.length > 0 && (
                <div className="p-3 rounded-md text-sm" style={{ background: "var(--error-subtle)", color: "var(--error-text)" }}>
                  <p className="flex items-center font-medium mb-1">
                    <AlertTriangle className="w-4 h-4 mr-1 shrink-0" />
                    {failedRows.length} row{failedRows.length === 1 ? "" : "s"} failed
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {failedRows.map((r) => (
                      <li key={r.row}>
                        Row {r.row} ({r.name}): {r.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <button type="button" onClick={reset} className="btn btn-secondary">Import Another File</button>
                <button type="button" onClick={handleClose} className="btn btn-primary">Done</button>
              </div>
            </div>
          )}
          </div>
        </div>
    </div>
  );
}
