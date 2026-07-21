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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={handleClose}
        />

        <div className="relative inline-block w-full max-w-lg p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
          <div className="flex justify-between items-center mb-5 border-b pb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Bulk Import Vault Entries
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-md">
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
              className="mt-2 inline-flex items-center text-brand-blue hover:text-blue-700 font-medium"
            >
              <Download className="w-4 h-4 mr-1" />
              Download CSV template
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 text-sm text-brand-red bg-red-50 rounded border border-red-100">
              {error}
            </div>
          )}

          {!result && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-blue file:text-white hover:file:bg-blue-700"
                />
              </div>

              <div className="mt-5 pt-4 border-t sm:flex sm:flex-row-reverse">
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="w-full inline-flex items-center justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 mr-2" />
                  {loading ? "Importing..." : "Import"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center p-3 rounded-md bg-green-50 text-brand-green text-sm">
                <CheckCircle className="w-5 h-5 mr-2 shrink-0" />
                {result.created} of {result.results.length} row
                {result.results.length === 1 ? "" : "s"} imported.
              </div>

              {qrPendingRows.length > 0 && (
                <div className="p-3 rounded-md bg-yellow-50 text-yellow-800 text-sm">
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
                <div className="p-3 rounded-md bg-red-50 text-brand-red text-sm">
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

              <div className="pt-4 border-t flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
                >
                  Import Another File
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md hover:bg-blue-700 focus:outline-none"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
