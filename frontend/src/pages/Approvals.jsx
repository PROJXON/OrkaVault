import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { format } from "date-fns";
import { Check, X as XIcon, Globe, MonitorSmartphone, MapPin } from "lucide-react";

const formatRequestType = (type) => {
  const map = {
    VIEW_90S: "Single View (90s)",
    TEMP_24H: "Temporary (24h)",
    ONGOING: "Indefinite",
  };
  return map[type] || type.replace(/_/g, " ");
};

export default function Approvals() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Modal state
  const [approveModal, setApproveModal] = useState(null); // { id, requesterName, accountName }
  const [approveText, setApproveText] = useState("");
  const [approveError, setApproveError] = useState("");

  const [denyModal, setDenyModal] = useState(null); // { id, requesterName, accountName }
  const [denyReason, setDenyReason] = useState("");
  const [denyError, setDenyError] = useState("");

  const fetchRequests = async () => {
    try {
      const { data } = await api.get("/requests");
      setRequests(data.filter((r) => r.status === "PENDING"));
    } catch (e) {
      console.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // ── Approve Flow ──
  const openApproveModal = (req) => {
    setApproveModal({
      id: req.id,
      requesterName: req.requester.name,
      accountName: req.account.name,
    });
    setApproveText("");
    setApproveError("");
  };

  const confirmApprove = async () => {
    if (approveText.trim().toLowerCase() !== "approve") {
      setApproveError('Please type "approve" exactly to confirm.');
      return;
    }
    setActionLoading(approveModal.id);
    try {
      await api.patch(`/requests/${approveModal.id}/approve`);
      setApproveModal(null);
      await fetchRequests();
    } catch (e) {
      setApproveError(e.response?.data?.error || "Failed to approve request");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Deny Flow ──
  const openDenyModal = (req) => {
    setDenyModal({
      id: req.id,
      requesterName: req.requester.name,
      accountName: req.account.name,
    });
    setDenyReason("");
    setDenyError("");
  };

  const confirmDeny = async () => {
    if (!denyReason.trim()) {
      setDenyError("A reason is required to deny access.");
      return;
    }
    setActionLoading(denyModal.id);
    try {
      await api.patch(`/requests/${denyModal.id}/deny`, {
        reason: denyReason.trim(),
      });
      setDenyModal(null);
      await fetchRequests();
    } catch (e) {
      setDenyError(e.response?.data?.error || "Failed to deny request");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="mt-2 text-sm text-gray-700">
          Review and action pending access requests.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Requester
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reason
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  Loading...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No pending requests
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {req.requester.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.account.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatRequestType(req.requestType)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                    <div className="truncate mb-1">{req.reason}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {req.deviceName && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          <MonitorSmartphone className="w-3 h-3 mr-1" />
                          {req.deviceName}
                        </span>
                      )}
                      {req.location && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          <MapPin className="w-3 h-3 mr-1" />
                          {req.location}
                        </span>
                      )}
                      {req.internationalAccessRequested && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          <Globe className="w-3 h-3 mr-1" />
                          Global
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => openApproveModal(req)}
                      disabled={actionLoading === req.id}
                      className="text-brand-green hover:text-green-700 disabled:opacity-50 inline-flex"
                      title="Approve"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => openDenyModal(req)}
                      disabled={actionLoading === req.id}
                      className="text-brand-red hover:text-red-700 disabled:opacity-50 inline-flex"
                      title="Deny"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Approve Confirmation Modal ── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={() => setApproveModal(null)}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Confirm Approval
              </h3>
              <p className="text-sm text-gray-600 mb-1">
                You are approving access for{" "}
                <span className="font-medium text-gray-900">
                  {approveModal.requesterName}
                </span>{" "}
                to{" "}
                <span className="font-medium text-gray-900">
                  {approveModal.accountName}
                </span>
                .
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Type{" "}
                <span className="font-mono bg-green-50 text-brand-green px-1.5 py-0.5 rounded text-xs font-bold">
                  approve
                </span>{" "}
                below to confirm.
              </p>
              <input
                type="text"
                value={approveText}
                onChange={(e) => {
                  setApproveText(e.target.value);
                  setApproveError("");
                }}
                placeholder='Type "approve" to confirm'
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-green focus:border-brand-green"
                autoFocus
              />
              {approveError && (
                <p className="text-xs text-brand-red mt-2">{approveError}</p>
              )}
              <div className="mt-5 flex justify-end space-x-3">
                <button
                  onClick={() => setApproveModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApprove}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-green rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deny Confirmation Modal ── */}
      {denyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={() => setDenyModal(null)}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Deny Access Request
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                You are denying access for{" "}
                <span className="font-medium text-gray-900">
                  {denyModal.requesterName}
                </span>{" "}
                to{" "}
                <span className="font-medium text-gray-900">
                  {denyModal.accountName}
                </span>
                . Please provide a reason.
              </p>
              <textarea
                value={denyReason}
                onChange={(e) => {
                  setDenyReason(e.target.value);
                  setDenyError("");
                }}
                placeholder="Reason for denial..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-brand-red focus:border-brand-red resize-none"
                autoFocus
              />
              {denyError && (
                <p className="text-xs text-brand-red mt-2">{denyError}</p>
              )}
              <div className="mt-5 flex justify-end space-x-3">
                <button
                  onClick={() => setDenyModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeny}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-red rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Deny Access
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
