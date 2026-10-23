import React, { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";

const MAX_FIELDS = 20;
let nextKey = 0;
const newKey = () => `cf-${nextKey++}`;

// Editor rows: { key, id, label, value }. `id` is set for fields already
// saved on the entry; their value starts blank and blank means "keep the
// stored value" (the modal never holds saved values), so an admin can
// rename / reorder / delete without retyping secrets.
export const customFieldsFromAccount = (account) =>
  (account?.customFields || []).map((f) => ({ key: newKey(), id: f.id, label: f.label, value: "" }));

// Body for POST/PATCH /accounts — existing + blank value → value: null (keep).
export const customFieldsPayload = (rows) =>
  rows.map((r) => ({
    id: r.id || undefined,
    label: r.label.trim(),
    value: r.id && r.value === "" ? null : r.value,
  }));

export default function CustomFieldsEditor({ fields, onChange }) {
  const [visibleKeys, setVisibleKeys] = useState(() => new Set());

  const update = (key, patch) => onChange(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const remove = (key) => onChange(fields.filter((f) => f.key !== key));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...fields, { key: newKey(), id: null, label: "", value: "" }]);
  const toggleVisible = (key) =>
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div>
      <label className="field-label">
        Custom Fields <span className="text-gray-400 font-normal">(optional — values are encrypted like the password)</span>
      </label>
      {fields.length > 0 && (
        <div className="mt-1 space-y-2">
          {fields.map((f, i) => (
            <div key={f.key} className="flex items-center gap-2">
              <input
                type="text"
                required
                maxLength={64}
                value={f.label}
                onChange={(e) => update(f.key, { label: e.target.value })}
                className="input"
                style={{ flex: "0 0 34%" }}
                placeholder="Label, e.g. PIN"
                aria-label="Field label"
              />
              <div className="relative flex-1 min-w-0">
                <input
                  type={visibleKeys.has(f.key) ? "text" : "password"}
                  required={!f.id}
                  maxLength={4096}
                  value={f.value}
                  onChange={(e) => update(f.key, { value: e.target.value })}
                  className="input"
                  style={{ paddingRight: 36 }}
                  placeholder={f.id ? "Unchanged — type to replace" : "Value"}
                  autoComplete="new-password"
                  aria-label={`${f.label || "Field"} value`}
                />
                <button
                  type="button"
                  onClick={() => toggleVisible(f.key)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  style={{ color: "var(--text-tertiary)" }}
                  title={visibleKeys.has(f.key) ? "Hide value" : "Show value"}
                >
                  {visibleKeys.has(f.key) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button type="button" className="iconbtn shrink-0 disabled:opacity-40" style={{ width: 28, height: 28 }} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                <ChevronUp width={14} height={14} />
              </button>
              <button type="button" className="iconbtn shrink-0 disabled:opacity-40" style={{ width: 28, height: 28 }} onClick={() => move(i, 1)} disabled={i === fields.length - 1} title="Move down">
                <ChevronDown width={14} height={14} />
              </button>
              <button type="button" className="iconbtn shrink-0" style={{ width: 28, height: 28 }} onClick={() => remove(f.key)} title="Remove field">
                <Trash2 width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {fields.length < MAX_FIELDS && (
        <button type="button" onClick={add} className="btn btn-secondary btn-sm mt-2">
          <Plus width={14} height={14} /> Add Field
        </button>
      )}
    </div>
  );
}
