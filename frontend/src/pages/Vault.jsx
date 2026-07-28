import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Plus, Edit2, Trash2, Heart, History, RefreshCw, UploadCloud,
  ShieldAlert, Lock, X, Bell, Star, Clock, KeyRound, LayoutGrid, Folder,
} from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import RevealPassword from "../components/RevealPassword";
import RevealOtp from "../components/RevealOtp";
import AdminQrModal from "../components/AdminQrModal";
import RequestModal from "../components/RequestModal";
import AddEntryModal from "../components/AddEntryModal";
import EditEntryModal from "../components/EditEntryModal";
import BulkImportModal from "../components/BulkImportModal";
import QrPendingModal from "../components/QrPendingModal";
import AccessHistoryModal from "../components/AccessHistoryModal";
import HealthPill from "../components/HealthPill";
import { meetsClearance } from "../lib/clearance";

const formatPlatformType = (type) => {
  const map = { THIRD_PARTY: "Third Party", GOOGLE_WORKSPACE: "Google Workspace" };
  return map[type] || type.replace(/_/g, " ");
};

const formatRequestType = (type) => {
  const map = { VIEW_90S: "Single View (90s)", TEMP_24H: "Temporary (24h)", ONGOING: "Indefinite" };
  return map[type] || type.replace(/_/g, " ");
};

export default function Vault() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [loading, setLoading] = useState(true);
  const [requestModal, setRequestModal] = useState({ isOpen: false, account: null, prefill: null });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [qrPendingOpen, setQrPendingOpen] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, account: null });
  const [historyModal, setHistoryModal] = useState({ isOpen: false, account: null });
  const [favorites, setFavorites] = useState(user?.favorites || []);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [sortMode, setSortMode] = useState("smart");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [activePane, setActivePane] = useState("catalog");
  const [selectedForDelete, setSelectedForDelete] = useState(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [syncingWorkspace, setSyncingWorkspace] = useState(false);
  const [showBulkSelect, setShowBulkSelect] = useState(false);

  const selectAccount = (id) => {
    setSelectedId(id);
    setActivePane("work");
  };

  useEffect(() => {
    setSearch(searchParams.get("q") || "");
  }, [searchParams]);

  const updateSearch = (value) => {
    setSearch(value);
    setSearchParams(value ? { q: value } : {}, { replace: true });
  };

  const handleToggleFavorite = async (id) => {
    try {
      if (favorites.includes(id)) {
        await api.delete(`/users/me/favorites/${id}`);
        setFavorites(favorites.filter((f) => f !== id));
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
      if (selectedId === id) setSelectedId(null);
      fetchAccounts();
    } catch (e) {
      alert("Failed to delete account");
    }
  };

  const toggleSelectForDelete = (id) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteAccounts = async () => {
    setBulkDeleting(true);
    try {
      await api.post("/accounts/bulk-delete", { accountIds: [...selectedForDelete] });
      if (selectedForDelete.has(selectedId)) setSelectedId(null);
      setSelectedForDelete(new Set());
      setBulkDeleteConfirmOpen(false);
      setBulkDeleteConfirmText("");
      fetchAccounts();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to delete selected accounts");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleSyncWorkspaceAccounts = async () => {
    setSyncingWorkspace(true);
    try {
      const { data } = await api.post("/accounts/sync-workspace");
      alert(`Created ${data.created} new vault entr${data.created === 1 ? "y" : "ies"} from Google Workspace. ${data.skipped} already existed and were left unchanged.`);
      fetchAccounts();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to sync Workspace accounts");
    } finally {
      setSyncingWorkspace(false);
    }
  };

  const handleForceRotate = async (id) => {
    const account = accounts.find((a) => a.id === id);
    const ownerLabel = account?.ownerName || account?.ownerEmail || "the owner";
    if (!window.confirm(`Force mandatory password rotation for this account? This will alert ${ownerLabel}.`)) return;
    try {
      await api.post(`/accounts/${id}/force-rotate`);
      alert(`Force rotation triggered. ${ownerLabel} notified.`);
      fetchAccounts();
    } catch (e) {
      alert("Failed to force rotation");
    }
  };

  const fetchAccounts = async () => {
    try {
      const [{ data: accountsData }, { data: collectionsData }] = await Promise.all([
        api.get("/accounts"),
        api.get("/collections"),
      ]);
      setAccounts(accountsData);
      setCollections(collectionsData);
    } catch (e) {
      console.error("Failed to load vault data");
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const [{ data: notifs }, { data: reqs }] = await Promise.all([
        api.get("/notifications"),
        api.get("/requests?type=my"),
      ]);
      setNotifications(notifs);
      setMyRequests(reqs);
    } catch (e) {
      console.error("Failed to load dashboard data");
    }
  };

  const handleGrantExpired = (accountId) => {
    setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, hasGrant: false } : a)));
  };

  const handleRequestRenewal = async (accountId) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    try {
      const { data } = await api.get(`/requests/last-approved/${accountId}`);
      setRequestModal({
        isOpen: true,
        account,
        prefill: data ? {
          requestType: data.requestType,
          reason: data.reason,
          deviceName: data.deviceName || "",
          location: data.location || "",
          internationalAccessRequested: data.internationalAccessRequested || false,
        } : null
      });
    } catch (e) {
      console.error("Failed to fetch renewal details", e);
      setRequestModal({ isOpen: true, account, prefill: null });
    }
  };

  const getGrantExpirationInfo = (grantExpiresAt) => {
    if (!grantExpiresAt) return null;
    const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
    if (msRemaining <= 0) return { expired: true, text: "Access expired" };

    const totalSecs = Math.floor(msRemaining / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    let text = "";
    if (hours > 0) {
      text = `${hours}h ${minutes}m remaining`;
    } else if (minutes > 0) {
      text = `${minutes}m remaining`;
    } else {
      text = `${seconds}s remaining`;
    }
    return { expired: false, text, msRemaining };
  };

  useEffect(() => {
    fetchAccounts();
    fetchDashboard();
  }, []);

  // Deep link from elsewhere in the app (e.g. Collections Management)
  // straight to one entry: /vault?select=<accountId>.
  useEffect(() => {
    const wantedId = searchParams.get("select");
    if (!wantedId || loading) return;
    if (accounts.some((a) => a.id === wantedId)) {
      selectAccount(wantedId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("select");
    setSearchParams(next, { replace: true });
  }, [searchParams, accounts, loading]);

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q);
    const matchesCollection = selectedCollection ? a.collectionId === selectedCollection : true;
    const matchesFav = favoritesOnly ? favorites.includes(a.id) : true;
    return matchesSearch && matchesCollection && matchesFav;
  });

  const sortedAccounts = useMemo(() => {
    const list = [...filtered];
    if (sortMode === "health") {
      list.sort((a, b) => a.healthScore - b.healthScore);
    } else if (sortMode === "recent") {
      list.sort((a, b) => new Date(b.lastUpdatedAt || b.createdAt) - new Date(a.lastUpdatedAt || a.createdAt));
    } else {
      list.sort((a, b) => {
        const aFav = favorites.includes(a.id);
        const bFav = favorites.includes(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [filtered, sortMode, favorites]);

  const weakCount = accounts.filter((a) => a.healthLabel === "WEAK").length;
  const avgHealth = accounts.length > 0 ? Math.round(accounts.reduce((sum, a) => sum + a.healthScore, 0) / accounts.length) : 0;
  const qrPendingAccounts = accounts.filter(
    (a) => a.platformType === "GOOGLE_WORKSPACE" && !a.isGoogleSSO && !a.hasTotpQr
  );
  const favoriteAccounts = accounts.filter((a) => favorites.includes(a.id));
  const unreadNotifs = notifications.filter((n) => !n.read).slice(0, 5);
  const recentRequests = myRequests.slice(0, 4);

  const hasSufficientClearance = (account) =>
    user.role === "ADMIN" || meetsClearance(user.clearanceLevel, account.requiredClearance);

  const hasDirectAccess = (account) => {
    if (user.role === "ADMIN") return true;
    if (!hasSufficientClearance(account)) return false;
    if (user.role === "MANAGER" && account.collectionId) {
      return user.managedCollections?.some((c) => c.id === account.collectionId);
    }
    return false;
  };

  const healthTagClass = (label) => (label === "STRONG" ? "hi" : label === "MEDIUM" ? "mid" : label === "SSO" ? "info" : "lo");

  const collectionsById = useMemo(
    () => Object.fromEntries(collections.map((c) => [c.id, c])),
    [collections],
  );

  const selected = accounts.find((a) => a.id === selectedId) || null;
  const selectedEntryCollection = selected?.collectionId ? collectionsById[selected.collectionId] : null;

  useEffect(() => {
    if (selectedId && !accounts.some((a) => a.id === selectedId) && !loading) {
      setSelectedId(null);
    }
  }, [accounts, selectedId, loading]);

  return (
    <div className="-m-6 w-[calc(100%+48px)] h-[calc(100%+48px)] flex flex-col">
      <div className="pane-tabs">
        <button className={activePane === "catalog" ? "on" : ""} onClick={() => setActivePane("catalog")}>
          <KeyRound width={14} height={14} /> Catalog
        </button>
        <button className={activePane === "work" ? "on" : ""} onClick={() => setActivePane("work")}>
          <Star width={14} height={14} /> Workspace
        </button>
        <button className={activePane === "dash" ? "on" : ""} onClick={() => setActivePane("dash")}>
          <LayoutGrid width={14} height={14} /> Dashboard
        </button>
      </div>
      <div className="vault-workspace">

        {/* ===== LEFT · CATALOG ===== */}
        <section className={`pane ${activePane === "catalog" ? "pane-active" : ""}`}>
          <div className="pane-head">
            <span className="pin catalog"><KeyRound width={15} height={15} /></span>
            <span className="ph-title">Vault Catalog</span>
            {user.role === "ADMIN" && (
              <div className="flex items-center gap-1 ml-auto">
                {qrPendingAccounts.length > 0 && (
                  <button className="iconbtn" title={`QR Codes Pending (${qrPendingAccounts.length})`} onClick={() => setQrPendingOpen(true)}>
                    <ShieldAlert width={20} height={20} style={{ color: "var(--warning-text)" }} />
                    <span className="badge">{qrPendingAccounts.length}</span>
                  </button>
                )}
                <button
                  className="iconbtn"
                  title="Sync Workspace Accounts — creates a vault entry for any active Google Workspace account that doesn't have one yet"
                  onClick={handleSyncWorkspaceAccounts}
                  disabled={syncingWorkspace}
                >
                  <RefreshCw width={20} height={20} className={syncingWorkspace ? "animate-spin" : ""} />
                </button>
                <button className="iconbtn" title="Bulk Import" onClick={() => setBulkImportOpen(true)}>
                  <UploadCloud width={20} height={20} />
                </button>
                <button className="iconbtn" title="Add Entry" onClick={() => setAddModalOpen(true)}>
                  <Plus width={20} height={20} />
                </button>
              </div>
            )}
            <span className="ph-sub">{accounts.length} accounts in the organization vault.</span>
          </div>

          <div className="px-4 pb-3 flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2" width={15} height={15} style={{ color: "var(--text-tertiary)" }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Search this catalog…"
                value={search}
                onChange={(e) => updateSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select className="select" style={{ flex: 1 }} value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
                <option value="">All Collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select className="select" style={{ flex: 1 }} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                <option value="smart">Favorites first</option>
                <option value="health">Weakest first</option>
                <option value="recent">Recently updated</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <button
                className={`btn btn-sm ${favoritesOnly ? "btn-secondary" : "btn-ghost"}`}
                style={{ alignSelf: "flex-start" }}
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Heart width={13} height={13} className={favoritesOnly ? "fill-current" : ""} style={favoritesOnly ? { color: "var(--error-solid)" } : {}} />
                Favorites only
              </button>
              {user.role === "ADMIN" && sortedAccounts.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-[var(--text-secondary)]">Bulk Select</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showBulkSelect}
                    onClick={() => {
                      setShowBulkSelect(!showBulkSelect);
                      if (showBulkSelect) {
                        setSelectedForDelete(new Set());
                      }
                    }}
                    className={`relative inline-flex shrink-0 h-5 w-9 border-2 border-transparent rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand-red ${
                      showBulkSelect ? "bg-brand-red" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                        showBulkSelect ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
            {user.role === "ADMIN" && sortedAccounts.length > 0 && showBulkSelect && (
              <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-[var(--border-subtle)]">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "var(--text-tertiary)" }}>
                  <input
                    type="checkbox"
                    checked={selectedForDelete.size > 0 && selectedForDelete.size === sortedAccounts.length}
                    onChange={() =>
                      setSelectedForDelete((prev) =>
                        prev.size === sortedAccounts.length ? new Set() : new Set(sortedAccounts.map((a) => a.id)),
                      )
                    }
                    className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-red focus:ring-brand-red"
                  />
                  Select all
                </label>
                {selectedForDelete.size > 0 && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                  >
                    <Trash2 width={13} height={13} /> Delete ({selectedForDelete.size})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pane-scroll scroll-area">
            {loading ? (
              <div className="text-sm text-muted py-6 text-center">Loading…</div>
            ) : sortedAccounts.length === 0 ? (
              <div className="text-sm text-muted py-6 text-center">No accounts found</div>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedAccounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => selectAccount(account.id)}
                    className={`cat-card ${selectedId === account.id ? "sel" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex items-start gap-2">
                        {user.role === "ADMIN" && showBulkSelect && (
                          <input
                            type="checkbox"
                            checked={selectedForDelete.has(account.id)}
                            onChange={() => toggleSelectForDelete(account.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 shrink-0 rounded border-gray-300 dark:border-[var(--border-default)] text-brand-red focus:ring-brand-red"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{account.name}</div>
                          <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{account.username}</div>
                        </div>
                      </div>
                      <button
                        className={`heart shrink-0 ${favorites.includes(account.id) ? "on" : ""}`}
                        onClick={(e) => { e.stopPropagation(); handleToggleFavorite(account.id); }}
                      >
                        <Heart width={15} height={15} className={favorites.includes(account.id) ? "fill-current" : ""} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <HealthPill label={account.healthLabel} />
                      <span className="badge-pill">{formatPlatformType(account.platformType)}</span>
                      {account.requiredClearance && <span className="badge-pill">{account.requiredClearance}</span>}
                      {collectionsById[account.collectionId] && (
                        <span className="badge-pill">{collectionsById[account.collectionId].name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===== CENTER · WORKSPACE ===== */}
        <section className={`pane pane-mid ${activePane === "work" ? "pane-active" : ""}`}>
          {!selected ? (
            <div className="empty flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="ei w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--bg-muted)", color: "var(--text-tertiary)" }}>
                <KeyRound width={26} height={26} />
              </div>
              <div className="font-semibold" style={{ color: "var(--text-secondary)" }}>No account selected</div>
              <div className="text-sm mt-1 max-w-xs text-muted">Choose an entry from the catalog to view details and request or reveal access.</div>
            </div>
          ) : (
            <div className="pane-inner flex flex-col h-full min-h-0">
              <div className="work-crumbs flex items-center gap-2 px-4 pt-3 text-xs flex-wrap">
                <span className="cursor-pointer text-muted" onClick={() => { setSelectedId(null); setActivePane("catalog"); }}>Vault</span>
                <span className="text-muted">/</span>
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{selected.name}</span>
                <button className="iconbtn ml-auto" style={{ width: 28, height: 28 }} onClick={() => { setSelectedId(null); setActivePane("catalog"); }}>
                  <X width={15} height={15} />
                </button>
              </div>
              <div className="pane-head" style={{ paddingTop: 8 }}>
                <span className="pin work"><KeyRound width={15} height={15} /></span>
                <div>
                  <div className="ph-title">{selected.name}</div>
                  <div className="text-xs text-muted">{selected.username} · {formatPlatformType(selected.platformType)}</div>
                </div>
              </div>

              <div className="pane-scroll scroll-area flex-1">
                <div className="card p-5 mb-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <HealthPill label={selected.healthLabel} />
                    {selected.requiredClearance && <span className="badge-pill">{selected.requiredClearance}</span>}
                    <span className="badge-pill">
                      Updated {selected.lastUpdatedAt ? new Date(selected.lastUpdatedAt).toLocaleDateString() : new Date(selected.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs mb-4 flex-wrap" style={{ color: "var(--text-tertiary)" }}>
                    <Folder width={13} height={13} className="shrink-0" />
                    {selectedEntryCollection ? (
                      <>
                        <span>{selectedEntryCollection.name}</span>
                        <span>·</span>
                        <span>
                          Managers:{" "}
                          {selectedEntryCollection.managers?.length > 0
                            ? selectedEntryCollection.managers.map((m) => m.name).join(", ")
                            : <span className="italic">None assigned</span>}
                        </span>
                      </>
                    ) : (
                      <span className="italic">Not in a collection</span>
                    )}
                  </div>
                  {selected.notes && (
                    <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{selected.notes}</p>
                  )}

                  <div
                    className="vault-protected"
                    onContextMenu={(e) => e.preventDefault()}
                    onCopy={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    {!hasSufficientClearance(selected) ? (
                      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
                        <Lock width={15} height={15} />
                        Your clearance level is insufficient for this account.
                      </div>
                    ) : !hasDirectAccess(selected) && !selected.hasGrant ? (
                      <button className="btn btn-primary" onClick={() => setRequestModal({ isOpen: true, account: selected })}>
                        Request Access
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          {selected.hasTotpQr && (
                            <RevealOtp key={`otp-${selected.id}`} accountId={selected.id} isAdmin={hasDirectAccess(selected)} onGrantExpired={() => handleGrantExpired(selected.id)} />
                          )}
                          <RevealPassword
                            key={`pw-${selected.id}`}
                            accountId={selected.id}
                            isAdmin={hasDirectAccess(selected)}
                            onRequestAccess={() => setRequestModal({ isOpen: true, account: selected })}
                            onGrantExpired={() => handleGrantExpired(selected.id)}
                          />
                          {user.role === "ADMIN" && selected.hasTotpQr && (
                            <AdminQrModal key={`qr-${selected.id}`} accountId={selected.id} />
                          )}
                        </div>

                        {selected.grantExpiresAt && !hasDirectAccess(selected) && (() => {
                          const info = getGrantExpirationInfo(selected.grantExpiresAt);
                          if (!info || info.expired) return null;

                          const isExpiringSoon = info.msRemaining <= 2 * 60 * 60 * 1000; // 2 hours

                          return (
                            <div className="w-full flex items-center justify-between p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300">
                              <span className="text-xs font-medium">
                                Temporary Access: {info.text}
                              </span>
                              {isExpiringSoon && (
                                <button
                                  onClick={() => handleRequestRenewal(selected.id)}
                                  className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 dark:bg-amber-900 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 transition-colors"
                                >
                                  Request Renewal
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {user.role === "ADMIN" && (
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModal({ isOpen: true, account: selected })}>
                      <History width={14} height={14} /> Access History
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditModal({ isOpen: true, account: selected })}>
                      <Edit2 width={14} height={14} /> Edit Entry
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleForceRotate(selected.id)}>
                      <RefreshCw width={14} height={14} /> Force Rotate
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAccount(selected.id)}>
                      <Trash2 width={14} height={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ===== RIGHT · DASHBOARD ===== */}
        <section className={`pane ${activePane === "dash" ? "pane-active" : ""}`}>
          <div className="pane-head">
            <span className="pin dash"><Star width={15} height={15} /></span>
            <span className="ph-title">Dashboard</span>
            <span className="ph-sub">Your personal command center.</span>
          </div>
          <div className="pane-scroll scroll-area">
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="kpi">
                <div className="kl">Total Entries</div>
                <div className="kv">{accounts.length}</div>
              </div>
              <div className="kpi">
                <div className="kl">Avg Health</div>
                <div className="kv">{avgHealth}</div>
              </div>
              <div className="kpi">
                <div className="kl">Weak Passwords</div>
                <div className="kv" style={{ color: weakCount > 0 ? "var(--error-text)" : "var(--success-text)" }}>{weakCount}</div>
              </div>
              <div className="kpi">
                <div className="kl">Favorites</div>
                <div className="kv">{favoriteAccounts.length}</div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dc-h"><Bell width={15} height={15} style={{ color: "var(--brand)" }} /> Alerts</div>
              {unreadNotifs.length === 0 ? (
                <div className="text-xs text-muted">You're all caught up.</div>
              ) : (
                unreadNotifs.map((n) => (
                  <div key={n.id} className="mini-row">
                    <span className="mr-ic"><Bell width={14} height={14} /></span>
                    <div className="mr-main">
                      <div className="mr-t">{n.title}</div>
                      <div className="mr-m">{n.body}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="dash-card">
              <div className="dc-h"><Heart width={15} height={15} style={{ color: "var(--error-solid)" }} /> Favorites</div>
              {favoriteAccounts.length === 0 ? (
                <div className="text-xs text-muted">Star accounts to pin them here.</div>
              ) : (
                favoriteAccounts.slice(0, 6).map((a) => (
                  <div key={a.id} className="mini-row" style={{ cursor: "pointer" }} onClick={() => selectAccount(a.id)}>
                    <span className="mr-ic"><KeyRound width={14} height={14} /></span>
                    <div className="mr-main">
                      <div className="mr-t">{a.name}</div>
                      <div className="mr-m">{formatPlatformType(a.platformType)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="dash-card">
              <div className="dc-h"><Clock width={15} height={15} style={{ color: "var(--accent-indigo)" }} /> Recent Requests</div>
              {recentRequests.length === 0 ? (
                <div className="text-xs text-muted">No requests submitted yet.</div>
              ) : (
                recentRequests.map((r) => (
                  <div key={r.id} className="mini-row">
                    <span className="mr-ic"><Clock width={14} height={14} /></span>
                    <div className="mr-main">
                      <div className="mr-t">{r.account?.name}</div>
                      <div className="mr-m">{formatRequestType(r.requestType)} · {r.status.toLowerCase()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <RequestModal
        isOpen={requestModal.isOpen}
        account={requestModal.account}
        prefill={requestModal.prefill}
        onClose={() => setRequestModal({ isOpen: false, account: null, prefill: null })}
        onSuccess={() => { fetchAccounts(); fetchDashboard(); }}
      />
      <AddEntryModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={fetchAccounts}
        collections={collections}
      />
      <BulkImportModal
        isOpen={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onSuccess={fetchAccounts}
      />
      <QrPendingModal
        isOpen={qrPendingOpen}
        onClose={() => setQrPendingOpen(false)}
        accounts={qrPendingAccounts}
        onSuccess={fetchAccounts}
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

      {/* Bulk delete confirmation — requires typing "approve" */}
      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => { setBulkDeleteConfirmOpen(false); setBulkDeleteConfirmText(""); }}
            />
            <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-xl sm:my-8">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-[var(--text-primary)] mb-2">
                Delete {selectedForDelete.size} vault entr{selectedForDelete.size === 1 ? "y" : "ies"}?
              </h3>
              <p className="text-sm text-gray-600 dark:text-[var(--text-secondary)] mb-4">
                These accounts and their secrets will be permanently deleted. This action is logged
                to the immutable audit log. Type <span className="font-mono font-semibold">approve</span> to
                confirm.
              </p>
              <input
                type="text"
                autoFocus
                value={bulkDeleteConfirmText}
                onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                placeholder="approve"
                className="input mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setBulkDeleteConfirmOpen(false); setBulkDeleteConfirmText(""); }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkDeleteConfirmText.trim().toLowerCase() !== "approve" || bulkDeleting}
                  onClick={handleBulkDeleteAccounts}
                  className="btn btn-danger btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
