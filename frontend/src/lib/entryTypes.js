import { createElement } from "react";
import { KeyRound, StickyNote } from "lucide-react";

// Display rules per Account.entryType — mirrors backend/src/services/entryTypes.ts.
// Single source for the add/edit modals, the detail pane, and catalog tiles.
export const ENTRY_TYPES = {
  LOGIN: {
    label: "Login",
    icon: KeyRound,
    secretLabel: "Password",
    multiline: false,
  },
  SECURE_NOTE: {
    label: "Secure Note",
    icon: StickyNote,
    secretLabel: "Note",
    multiline: true,
  },
};

export const NOTE_MAX_LENGTH = 10000;

export function entryTypeInfo(type) {
  return ENTRY_TYPES[type] || ENTRY_TYPES.LOGIN;
}

export function isNote(account) {
  return account?.entryType === "SECURE_NOTE";
}

// Small type icon used on tiles, list rows and the detail header.
// createElement rather than JSX because this is a .js file.
export function EntryTypeIcon({ type, size = 16, style }) {
  const info = entryTypeInfo(type);
  return createElement(
    "span",
    { title: info.label, "aria-label": info.label, role: "img", style: { display: "inline-flex", flexShrink: 0 } },
    createElement(info.icon, {
      width: size,
      height: size,
      "aria-hidden": true,
      style: { color: "var(--text-tertiary)", ...style },
    }),
  );
}
