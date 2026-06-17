import React, { useState, useEffect } from "react";
import { Folder, Plus, Trash2, Edit2 } from "lucide-react";
import api from "../lib/api";

export default function Collections() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);

  const fetchCollections = async () => {
    try {
      const { data } = await api.get("/collections");
      setCollections(data);
    } catch (e) {
      console.error("Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/collections/${editingId}`, { name, description });
      } else {
        await api.post("/collections", { name, description });
      }
      setName("");
      setDescription("");
      setEditingId(null);
      fetchCollections();
    } catch (e) {
      alert("Failed to save collection");
    }
  };

  const handleEdit = (c) => {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description || "");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this collection? Accounts will be uncategorized.")) return;
    try {
      await api.delete(`/collections/${id}`);
      fetchCollections();
    } catch (e) {
      alert("Failed to delete collection");
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Collections Management</h1>
        <p className="mt-2 text-sm text-gray-700">
          Create and manage collections to group vault entries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="bg-white p-6 shadow rounded-lg border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingId ? "Edit Collection" : "New Collection"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md py-2 px-3 shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  rows="3"
                />
              </div>
              <div className="flex justify-end space-x-3">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setName(""); setDescription(""); }}
                    className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none"
                >
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collection</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">Loading...</td>
                  </tr>
                ) : collections.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">No collections found.</td>
                  </tr>
                ) : (
                  collections.map((c) => (
                    <tr key={c.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Folder className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{c.name}</div>
                            {c.description && <div className="text-xs text-gray-500">{c.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {c._count?.accounts || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(c)}
                          className="text-brand-blue hover:text-blue-700 mr-4"
                        >
                          <Edit2 className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-brand-red hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
