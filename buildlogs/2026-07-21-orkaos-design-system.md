# Adopt OrkaOS design system + rebuild Vault as a 3-pane workspace
Date: 2026-07-21

## Why
CEO-provided reference (`docs/OrkaMaster-Index.html`) defines the OrkaOS
design system (Light default, 60/30/10, Deep Navy + Orka Blue, 3-pane
App Shell) that every Orka app should match. OrkaVault's frontend was
still on a mismatched navy/teal Tailwind theme with no dark mode. Per
user decision: rebuild the app shell as the literal 3-pane
Catalog/Workspace/Dashboard + full-width Admin pattern from the
reference (not just a color reskin), and add real light/dark theming.

## What changed
- `frontend/src/index.css`: OrkaOS light/dark CSS variable tokens +
  component classes (btn, card, input/select/textarea, health-tag,
  table-shell, topnav, sidenav/navitem, menu/notif, pane/cat-card,
  dash-card/kpi, admin-tile/grid, modal/scrim, theme-switch, scrollbars).
- `frontend/tailwind.config.js`: `darkMode:'class'`; remapped Tailwind's
  `gray` scale and `brand.*` colors to the OrkaOS palette so existing
  `gray-*`/`brand-*` utility usage across the app inherits the new look
  without per-file edits; added `orka.*` namespace; Inter as default sans.
- `frontend/index.html`: swapped Outfit/JetBrains Mono for Inter, removed
  a stale dark-background inline `<style>` left from an earlier design.
- `frontend/src/lib/themeContext.jsx` (new): light/dark state, persisted
  to localStorage, applied via `data-theme` attr + `dark` class on `<html>`.
- `frontend/src/main.jsx`: wrapped app in `ThemeProvider`.
- `frontend/src/components/TopBar.jsx`: rebuilt — brand mark, global
  search (`/vault?q=`), Vault/Manage role toggle for MANAGER/ADMIN, theme
  switch, restyled notification bell, profile dropdown (was a bare
  logout button before).
- `frontend/src/components/Sidebar.jsx`: restyled to the OrkaOS sidenav
  look (light surface, grouped Workspace/Manage nav, same role-filtered
  nav data as before); profile block moved out to TopBar.
- `frontend/src/components/DashboardLayout.jsx`: canvas background var.
- `frontend/src/pages/Vault.jsx`: rebuilt as a 3-pane workspace (Catalog
  search/filter/sort + cat-cards, Workspace detail pane with
  request/reveal/edit/rotate/history actions, Dashboard pane with
  KPIs/alerts/favorites/recent requests) instead of a single table. All
  existing handlers (favorite, delete, force-rotate, reveal, bulk
  import, QR pending) preserved.
- `frontend/src/pages/ManageConsole.jsx` (new) + `/manage` route in
  `App.jsx`: admin-tile landing page for MANAGER/ADMIN linking to the
  existing management pages (Approvals, My Collections, Directory,
  Users, Collections, Health, Audit, Workspace Activity, Settings).
- `frontend/src/components/HealthPill.jsx` and the Vault-flow modals
  (`RequestModal`, `AccessHistoryModal`, `AddEntryModal`,
  `EditEntryModal`, `BulkImportModal`, `QrPendingModal`, `QrUploadList`,
  `NotificationBell`, `RevealQrCode`): restyled to the new
  scrim/modal/input/badge classes; internal logic unchanged.
- Remaining pages (Login, Register, Profile, Requests, Approvals,
  ManagerCollections, Directory, Users, Collections, Audit,
  WorkspaceActivity, Health, Settings) and a few smaller components:
  mechanical pass adding `dark:` variants (via CSS-var arbitrary values)
  alongside their existing `bg-white`/`text-gray-*`/`border-gray-*`
  classes, so they stay readable in dark mode without a full rewrite.
- `ARCHITECTURE.md`: documented the new `/manage` route, Vault's 3-pane
  structure, and the design-token/theme setup.

## Notes / gotchas
- `pages/AdminDashboard.jsx`, `ManagerDashboard.jsx`, `UserDashboard.jsx`
  and `components/PasswordTable.jsx`/`RevealModal.jsx` are pre-existing
  dead code (import a nonexistent `apiFetch` from `App.jsx`, not routed
  anywhere) — left untouched, not part of this change.
- This sandbox has no browser tool and no local Postgres, so I could not
  click through the authenticated flows (Vault, Manage console, dark
  mode) end-to-end. Verified instead that every touched file transforms
  cleanly through Vite's dev server (no syntax errors) and reviewed the
  logic by hand. Also found and fixed an unrelated pre-existing
  environment issue (`frontend/node_modules` was missing the
  `@rollup/rollup-linux-x64-gnu` optional dependency, a known npm bug —
  installed it so `npm run dev`/`build` work in this environment).
  Please click through login → Vault → Manage → theme toggle once the
  backend DB is reachable, before treating this as fully verified.
- The many admin CRUD pages (Users, Collections, Settings, etc.) keep
  their existing Tailwind-utility markup rather than being rewritten to
  the new component classes — they get the new color palette for free
  via the Tailwind config remap plus a `dark:` safety net, but their
  internal modals/cards aren't using the `.modal`/`.card` classes like
  the Vault flow is. Worth a follow-up pass if those pages need the same
  visual polish as Vault/Manage.
