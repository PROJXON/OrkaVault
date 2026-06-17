import React, { useState, useEffect } from "react";
import { Folder, Key } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import RevealPassword from "../components/RevealPassword";
import RevealQrCode from "../components/RevealQrCode";
import HealthPill from "../components/HealthPill";

const formatPlatformType = (type) => {
  const map = {
    THIRD_PARTY: "Third Party",
    GOOGLE_WORKSPACE: "Google Workspace",
  };
  return map[type] || type.replace(/_/g, " ");
};

export default function ManagerCollections() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState(
    user?.managedCollections?.[0]?.id || ""
  );

  useEffect(() => {
    if (!selectedCollection && user?.managedCollections?.length > 0) {
      setSelectedCollection(user.managedCollections[0].id);
    }
  }, [user, selectedCollection]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const { data } = await api.get("/accounts");
        // Only keep accounts that belong to the manager's assigned collections
        const managedIds = user?.managedCollections?.map(c => c.id) || [];
        const filtered = data.filter(a => managedIds.includes(a.collectionId));
        setAccounts(filtered);
      } catch (e) {
        console.error("Failed to load managed accounts");
      } finally {
        setLoading(false);
      }
    };
    if (user?.managedCollections?.length > 0) {
      fetchAccounts();
    } else {
      setLoading(false);
    }
  }, [user]);

  const displayedAccounts = accounts.filter(
    a => selectedCollection ? a.collectionId === selectedCollection : true
  );

  if (!user?.managedCollections || user.managedCollections.length === 0) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center">
        <Folder className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No Managed Collections</h3>
        <p className="mt-1 text-sm text-gray-500">
          You have not been assigned to manage any collections.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            My Managed Collections
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Direct access to accounts within the collections you manage.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm rounded-md"
          >
            <option value="">All Managed Collections</option>
            {user.managedCollections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Health
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Password
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : displayedAccounts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                    No accounts found in this collection
                  </td>
                </tr>
              ) : (
                displayedAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Key className="mr-3 h-5 w-5 text-gray-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{account.name}</div>
                          <div className="text-xs text-gray-500">{
                            user.managedCollections.find(c => c.id === account.collectionId)?.name
                          }</div>
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
                    <td
                      className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium vault-protected"
                      onContextMenu={(e) => e.preventDefault()}
                      onCopy={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      <div className="flex justify-end items-center space-x-3">
                        {account.hasTotpQr && (
                          <RevealQrCode
                            accountId={account.id}
                            isAdmin={true} // Managers always have access to their managed collections
                          />
                        )}
                        <RevealPassword
                          accountId={account.id}
                          isAdmin={true} // Managers always have access to their managed collections
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
