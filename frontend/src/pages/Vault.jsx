import React, { useState, useEffect, useRef } from "react";
import { Search, Plus, Edit2, Trash2, Star, History, RefreshCw } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import RevealPassword from "../components/RevealPassword";
import RevealQrCode from "../components/RevealQrCode";
import RequestModal from "../components/RequestModal";
import AddEntryModal from "../components/AddEntryModal";
import EditEntryModal from "../components/EditEntryModal";
import AccessHistoryModal from "../components/AccessHistoryModal";
import HealthPill from "../components/HealthPill";

const formatPlatformType = (type) => {
  const map = {
    THIRD_PARTY: "Third Party",
    GOOGLE_WORKSPACE: "Google Workspace",
  };
  return map[type] || type.replace(/_/g, " ");
};

export default function Vault() {
  const { user } = useAuth();
  const activeTimeouts = useRef({});
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestModal, setRequestModal] = useState({
    isOpen: false,
    account: null,
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, account: null });
  const [historyModal, setHistoryModal] = useState({ isOpen: false, account: null });
  const [favorites, setFavorites] = useState(user?.favorites || []);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("");

  const handleToggleFavorite = async (id) => {
    try {
      if (favorites.includes(id)) {
        await api.delete(`/users/me/favorites/${id}`);
        setFavorites(favorites.filter(f => f !== id));
      } else {
        await api.post(`/users/me/favorites/${id}`);
        setFavorites([...favorites, id]);
      }
    } catch (e) {
      console.error("Failed to toggle favorite");
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm("Are you sure you want to completely delete this account from the vault?")) return;
    try {
      await api.delete(`/accounts/${id}`);
      fetchAccounts();
    } catch (e) {
      alert("Failed to delete account");
    }
  };

  const handleForceRotate = async (id) => {
    if (!window.confirm("Force mandatory password rotation for this account? This will alert the owner.")) return;
    try {
      await api.post(`/accounts/${id}/force-rotate`);
      alert("Force rotation triggered. Owner notified.");
      fetchAccounts();
    } catch (e) {
      alert("Failed to force rotation");
    }
  };

  const fetchAccounts = async () => {
    try {
      const [{ data: accountsData }, { data: collectionsData }] = await Promise.all([
        api.get("/accounts"),
        api.get("/collections")
      ]);
      setAccounts(accountsData);
      setCollections(collectionsData);
    } catch (e) {
      console.error("Failed to load vault data");
    } finally {
      setLoading(false);
    }
  };

  const handleGrantExpired = (accountId) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, hasGrant: false } : a))
    );
  };


  useEffect(() => {
    fetchAccounts();
  }, []);

  const filtered = accounts.filter(
    (a) => {
      const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
                            a.username.toLowerCase().includes(search.toLowerCase());
      const matchesCollection = selectedCollection ? a.collectionId === selectedCollection : true;
      return matchesSearch && matchesCollection;
    }
  );

  const sortedAccounts = [...filtered].sort((a, b) => {
    const aFav = favorites.includes(a.id);
    const bFav = favorites.includes(b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return a.name.localeCompare(b.name);
  });

  const weakCount = accounts.filter((a) => a.healthLabel === "WEAK").length;
  const avgHealth = accounts.length > 0 ? Math.round(accounts.reduce((sum, a) => sum + a.healthScore, 0) / accounts.length) : 0;

  // Determine who can see the password directly without a grant
  const hasDirectAccess = (account) => {
    if (user.role === "ADMIN") return true;
    if (user.role === "MANAGER" && account.collectionId) {
      return user.managedCollections?.some((c) => c.id === account.collectionId);
    }
    return false;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Organization Vault
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all approved accounts in the organization.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <div className="relative rounded-md shadow-sm">
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="focus:ring-brand-blue focus:border-brand-blue block w-full sm:text-sm border-gray-300 rounded-md py-2 px-3"
            >
              <option value="">All Collections</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="focus:ring-brand-blue focus:border-brand-blue block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
              placeholder="Search vault..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {user.role === "ADMIN" && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none"
            >
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              Add Entry
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Entries</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{accounts.length}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Average Health Score</dt>
            <dd className="mt-1 flex items-baseline text-3xl font-semibold text-gray-900">
              {avgHealth}
              <span className="ml-2 text-sm font-medium text-gray-500">/ 100</span>
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Weak Passwords</dt>
            <dd className={`mt-1 text-3xl font-semibold ${weakCount > 0 ? "text-brand-red" : "text-brand-green"}`}>
              {weakCount}
            </dd>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Account
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Username
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Platform
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Health
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Last Modified
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Password
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : sortedAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    No accounts found
                  </td>
                </tr>
              ) : (
                sortedAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <button onClick={() => handleToggleFavorite(account.id)} className="mr-3 text-gray-400 hover:text-yellow-400 focus:outline-none">
                          <Star className={`h-5 w-5 ${favorites.includes(account.id) ? "fill-yellow-400 text-yellow-400" : ""}`} />
                        </button>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{account.name}</div>
                          {account.notes && <div className="text-xs text-gray-500 truncate max-w-xs mt-0.5" title={account.notes}>{account.notes}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatPlatformType(account.platformType)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <HealthPill label={account.healthLabel} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.lastUpdatedAt ? new Date(account.lastUpdatedAt).toLocaleDateString() : new Date(account.createdAt).toLocaleDateString()}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium vault-protected"
                      onContextMenu={(e) => e.preventDefault()}
                      onCopy={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {/* Password column */}
                      {!hasDirectAccess(account) && !account.hasGrant ? (
                        /* User without direct access or active grant → Request Access only */
                        <div className="flex justify-end">
                          <button
                            onClick={() => setRequestModal({ isOpen: true, account })}
                            className="text-brand-blue hover:text-blue-700 text-sm font-medium transition-colors"
                          >
                            Request Access
                          </button>
                        </div>
                      ) : (
                        /* Direct Access or active grant → full controls */
                        <div className="flex justify-end items-center space-x-3">
                          {account.hasTotpQr && (
                            <RevealQrCode
                              accountId={account.id}
                              isAdmin={hasDirectAccess(account)}
                              onGrantExpired={() => handleGrantExpired(account.id)}
                            />
                          )}

                          <RevealPassword
                            accountId={account.id}
                            isAdmin={hasDirectAccess(account)}
                            onRequestAccess={() => setRequestModal({ isOpen: true, account })}
                            onGrantExpired={() => handleGrantExpired(account.id)}
                          />

                          {user.role === "ADMIN" && (
                            <>
                              <button
                                onClick={() => handleForceRotate(account.id)}
                                className="text-gray-400 hover:text-brand-orange"
                                title="Force Password Rotation"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setHistoryModal({ isOpen: true, account })}
                                className="text-gray-400 hover:text-brand-blue"
                                title="Access History"
                              >
                                <History className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditModal({ isOpen: true, account })}
                                className="text-gray-400 hover:text-brand-blue"
                                title="Edit Entry"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(account.id)}
                                className="text-gray-400 hover:text-brand-red"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RequestModal
        isOpen={requestModal.isOpen}
        account={requestModal.account}
        onClose={() => setRequestModal({ isOpen: false, account: null })}
        onSuccess={fetchAccounts}
      />

      <AddEntryModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={fetchAccounts}
        collections={collections}
      />

      <EditEntryModal
        isOpen={editModal.isOpen}
        account={editModal.account}
        onClose={() => setEditModal({ isOpen: false, account: null })}
        onSuccess={fetchAccounts}
        collections={collections}
      />

      <AccessHistoryModal
        isOpen={historyModal.isOpen}
        accountId={historyModal.account?.id}
        accountName={historyModal.account?.name}
        onClose={() => setHistoryModal({ isOpen: false, account: null })}
      />
    </div>
  );
}
