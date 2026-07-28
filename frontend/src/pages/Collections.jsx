import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Folder, Plus, Trash2, Edit2, X, ChevronRight, KeyRound, ArrowRight } from "lucide-react";
import api from "../lib/api";
import HealthPill from "../components/HealthPill";

const formatPlatformType = (type) => {
  const map = { THIRD_PARTY: "Third Party", GOOGLE_WORKSPACE: "Google Workspace" };
  return map[type] || type?.replace(/_/g, " ") || "";
};

export default function Collections() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [managerIds, setManagerIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchCollections = async () => {
    try {
      const [{ data: collectionsData }, { data: usersData }] = await Promise.all([
        api.get("/collections"),
        api.get("/users"),
      ]);
      setCollections(collectionsData);
      setManagers(usersData.filter((u) => u.role === "MANAGER"));
    } catch (e) {
      console.error("Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setManagerIds([]);
    setEditingId(null);
    setCreating(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/collections/${editingId}`, { name, description, managerIds });
      } else {
        await api.post("/collections", { name, description });
      }
      resetForm();
      fetchCollections();
    } catch (e) {
      alert("Failed to save collection");
    }
  };

  const toggleCreate = () => {
    if (creating) {
      resetForm();
    } else {
      resetForm();
      setCreating(true);
    }
  };

  const toggleEdit = (c) => {
    setExpandedId(null);
    if (editingId === c.id) {
      resetForm();
      return;
    }
    setCreating(false);
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description || "");
    setManagerIds(c.managers?.map((m) => m.id) || []);
  };

  const toggleExpand = (id) => {
    resetForm();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const goToAccountInVault = (accountId) => {
    navigate(`/vault?select=${accountId}`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this collection? Accounts will be uncategorized.")) return;
    try {
      await api.delete(`/collections/${id}`);
      if (editingId === id) resetForm();
      if (expandedId === id) setExpandedId(null);
      fetchCollections();
    } catch (e) {
      alert("Failed to delete collection");
    }
  };

  const renderForm = (isEdit) => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">Name</label>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
          rows="2"
        />
      </div>

      {isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">
            Managers
          </label>
          <div className="bg-gray-50 dark:bg-[var(--bg-canvas)] p-3 rounded-md border border-gray-200 dark:border-[var(--border-subtle)] max-h-40 overflow-y-auto space-y-2">
            {managers.map((m) => (
              <label key={m.id} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={managerIds.includes(m.id)}
                  onChange={(e) => {
                    const newIds = e.target.checked
                      ? [...managerIds, m.id]
                      : managerIds.filter((id) => id !== m.id);
                    setManagerIds(newIds);
                  }}
                  className="rounded border-gray-300 dark:border-[var(--border-default)] text-brand-blue focus:ring-brand-blue"
                />
                <span>{m.name}</span>
              </label>
            ))}
            {managers.length === 0 && (
              <span className="text-gray-500 dark:text-[var(--text-tertiary)] italic text-xs">
                No managers yet — set a user's role to Manager on the Users page first.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 border border-gray-300 dark:border-[var(--border-default)] shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-[var(--text-secondary)] bg-white dark:bg-[var(--bg-surface)] hover:bg-gray-50 dark:bg-[var(--bg-canvas)] focus:outline-none"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none"
        >
          {isEdit ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );

  // The manifest: every account attached to a collection, rendered as a
  // clickable chip that hands off straight to that entry in the Vault.
  const renderAccountsPanel = (c) => (
    <div className="acc-panel">
      {c.accounts?.length > 0 ? (
        <div className="acc-grid">
          {c.accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => goToAccountInVault(a.id)}
              className="acc-chip"
              title={`Open ${a.name} in the Vault`}
            >
              <span className="acc-chip-ic"><KeyRound width={13} height={13} /></span>
              <span className="acc-chip-main">
                <span className="acc-chip-name">{a.name}</span>
                <span className="acc-chip-sub">{a.username} · {formatPlatformType(a.platformType)}</span>
              </span>
              {a.healthLabel && <HealthPill label={a.healthLabel} />}
              <ArrowRight width={14} height={14} className="acc-chip-arrow" />
            </button>
          ))}
        </div>
      ) : (
        <div className="acc-empty">No accounts assigned to this collection yet.</div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[var(--text-primary)]">Collections Management</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
            Create and manage collections to group vault entries. Click a collection to see what's inside.
          </p>
        </div>
        <button
          onClick={toggleCreate}
          title="New Collection"
          className="shrink-0 mt-1 flex items-center justify-center w-10 h-10 rounded-full bg-brand-blue text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          {creating ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      {/* New collection form — expands below the header when "+" is clicked */}
      {creating && (
        <div className="mb-6 bg-white dark:bg-[var(--bg-surface)] p-6 shadow rounded-lg border border-gray-200 dark:border-[var(--border-subtle)]">
          <h3 className="text-lg font-medium text-gray-900 dark:text-[var(--text-primary)] mb-4">New Collection</h3>
          {renderForm(false)}
        </div>
      )}

      {/* Mobile: one card per collection instead of a wide table */}
      <div className="row-cards md:hidden">
        {loading ? (
          <div className="text-sm text-center py-6 text-muted">Loading...</div>
        ) : collections.length === 0 ? (
          <div className="text-sm text-center py-6 text-muted">No collections found.</div>
        ) : (
          collections.map((c) => (
            <div key={c.id} className="row-card">
              <button
                type="button"
                onClick={() => toggleExpand(c.id)}
                className="row-card-title w-full text-left"
                style={{ marginBottom: 4 }}
              >
                <Folder className="h-4 w-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
                <span className="flex-1">{c.name}</span>
                <span className="rcf-value" style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>
                  {c._count?.accounts || 0}
                </span>
                <ChevronRight width={16} height={16} className={`coll-chevron ${expandedId === c.id ? "open" : ""}`} />
              </button>
              {c.description && <div className="text-xs text-muted -mt-1 mb-2">{c.description}</div>}

              <div className={`coll-collapse ${expandedId === c.id ? "open" : ""}`}>
                <div>{renderAccountsPanel(c)}</div>
              </div>

              <div className="row-card-field">
                <span className="rcf-label">Managers</span>
                <span className="rcf-value">
                  {c.managers?.length > 0
                    ? c.managers.map((m) => m.name).join(", ")
                    : <span className="italic text-muted">None</span>}
                </span>
              </div>
              <div className="row-card-actions">
                <button onClick={() => toggleEdit(c)} className="btn btn-secondary btn-sm flex-1">
                  <Edit2 className="h-4 w-4" /> {editingId === c.id ? "Close" : "Edit"}
                </button>
                <button onClick={() => handleDelete(c.id)} className="btn btn-danger btn-sm flex-1">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
              {editingId === c.id && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[var(--border-subtle)]">
                  {renderForm(true)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-[var(--bg-surface)] shadow rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">Collection</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">Accounts</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">Managers</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[var(--bg-surface)] divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading...</td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-[var(--text-tertiary)]">No collections found.</td>
              </tr>
            ) : (
              collections.map((c) => (
                <React.Fragment key={c.id}>
                  <tr
                    className={`coll-row ${expandedId === c.id ? "open" : ""} ${editingId === c.id ? "bg-blue-50 dark:bg-[var(--bg-muted)]" : ""}`}
                    onClick={() => toggleExpand(c.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedId === c.id}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(c.id);
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <ChevronRight width={16} height={16} className={`coll-chevron mr-2 ${expandedId === c.id ? "open" : ""}`} />
                        <Folder className="h-5 w-5 text-gray-400 dark:text-[var(--text-tertiary)] mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">{c.name}</div>
                          {c.description && <div className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">{c.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                      {c._count?.accounts || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
                      {c.managers?.length > 0
                        ? c.managers.map((m) => m.name).join(", ")
                        : <span className="text-gray-400 dark:text-[var(--text-tertiary)] italic">None</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleEdit(c); }}
                        className="text-brand-blue hover:text-blue-700 mr-4"
                        title={editingId === c.id ? "Close" : "Edit"}
                      >
                        {editingId === c.id ? <X className="h-4 w-4 inline" /> : <Edit2 className="h-4 w-4 inline" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                        className="text-brand-red hover:text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="4" className="p-0 border-0">
                      <div className={`coll-collapse ${expandedId === c.id ? "open" : ""}`}>
                        <div className="px-6">{renderAccountsPanel(c)}</div>
                      </div>
                    </td>
                  </tr>
                  {editingId === c.id && (
                    <tr className="bg-blue-50 dark:bg-[var(--bg-muted)]">
                      <td colSpan="4" className="px-6 py-5">
                        {renderForm(true)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
