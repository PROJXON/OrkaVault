import React, { useState } from "react";
import { X } from "lucide-react";
import api from "../lib/api";

export default function RequestModal({ isOpen, onClose, account, onSuccess }) {
  const [requestType, setRequestType] = useState("VIEW_90S");
  const [reason, setReason] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [location, setLocation] = useState("");
  const [internationalAccessRequested, setInternationalAccessRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (isOpen) {
      setRequestType("VIEW_90S");
      setReason("");
      setDeviceName("");
      setLocation("");
      setInternationalAccessRequested(false);
      setError("");
    }
  }, [isOpen]);

  if (!isOpen || !account) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/requests", {
        accountId: account.id,
        requestType,
        reason,
        deviceName,
        location,
        internationalAccessRequested
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Request Access
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm font-medium text-gray-900">{account.name}</p>
            <p className="text-xs text-gray-500 mt-1">{account.platformType}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-brand-red bg-red-50 rounded border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Access Duration
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm rounded-md border"
              >
                <option value="VIEW_90S">Single View (90 seconds)</option>
                <option value="TEMP_24H">Temporary (24 Hours)</option>
                <option value="ONGOING">Ongoing Assignment</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Business Justification
              </label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                placeholder="Why do you need access to this credential?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Device Name
              </label>
              <input
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                placeholder="e.g. MacBook Pro, iPhone 14"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Location
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                placeholder="e.g. New York, NY"
              />
            </div>

            <div className="flex items-center">
              <input
                id="international-access"
                type="checkbox"
                checked={internationalAccessRequested}
                onChange={(e) => setInternationalAccessRequested(e.target.checked)}
                className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded"
              />
              <label htmlFor="international-access" className="ml-2 block text-sm text-gray-900">
                Requires International Access
              </label>
            </div>

            <div className="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand-blue text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
              >
                Submit Request
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
