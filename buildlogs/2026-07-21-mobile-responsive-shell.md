# Make the app shell and Vault workspace responsive
Date: 2026-07-21

## Why
Follow-up to the OrkaOS design system adoption: the new app shell (fixed
238px/74px sidebar, Vault's fixed 3-column pane grid) had no mobile
breakpoints, so the site was unusable below ~1024px — panes squeezed to
~100-150px wide, sidebar ate a third of a phone screen permanently.

## What changed
- `frontend/src/index.css`: added a responsive block — ≤1024px collapses
  Vault's `.vault-workspace` 3-column grid to a single column with a
  `.pane-tabs` switcher (Catalog/Workspace/Dashboard); ≤768px turns the
  sidebar into an off-canvas drawer (`.sidenav` fixed + `translateX`,
  toggled via a `.mobile-open` class) with a `.mobile-scrim` backdrop, and
  shows the `.hamburger` button. Desktop icon-collapse (`.sidenav.collapsed`)
  now hides nav labels via CSS instead of React conditionals, so the same
  markup can be forced back to full labels in the mobile drawer regardless
  of the desktop collapse preference.
- `frontend/src/components/TopBar.jsx`: added the hamburger menu button
  and the brand mark (logo + "OrkaVault") — the topnav previously had
  neither, an oversight from the earlier redesign pass, unrelated to
  mobile but fixed here since the hamburger needed a home next to it.
- `frontend/src/components/Sidebar.jsx`: accepts `mobileOpen`/`onClose`
  props; nav item labels are now always rendered in the DOM (CSS hides
  them when collapsed) instead of conditionally omitted.
- `frontend/src/components/DashboardLayout.jsx`: owns `mobileNavOpen`
  state, renders the scrim, closes the drawer on route change.
- `frontend/src/pages/Vault.jsx`: added the `activePane` state + mobile
  pane-tabs bar; selecting an account (from the catalog list, favorites,
  etc.) switches to the Workspace pane; the account grid wrapper moved
  from an inline `gridTemplateColumns` style to the `.vault-workspace`
  class so the responsive override can actually take effect (a CSS media
  query can't win against an inline style otherwise).
- `frontend/src/pages/{Audit,WorkspaceActivity,Requests,Approvals,Health,
  Collections}.jsx`: their tables were missing an `overflow-x-auto`
  wrapper (unlike Users/ManagerCollections, which already had one) — on
  narrow viewports a `min-w-full` table with no scroll wrapper forces the
  whole page to scroll horizontally. Wrapped each in a scrollable div.

## Notes / gotchas
- Same environment caveat as the previous entry: no browser tool and no
  local Postgres in this sandbox, so this was verified by having every
  touched file transform cleanly through Vite (no syntax errors) and by
  hand-tracing the CSS cascade (particularly the layered vs. unlayered
  `@layer components` vs. plain-CSS media-query ordering, which is what
  lets the responsive rules win). Please resize the browser / use device
  emulation to confirm the drawer, pane-tabs, and table scrolling once
  you can run it end-to-end.
- Other admin CRUD pages (Users, Directory, Settings, Collections forms,
  etc.) weren't otherwise touched — they already used fairly standard
  responsive Tailwind grid classes (`grid-cols-1 md:grid-cols-2 …`), so
  the main blockers were the shell chrome and the missing table scroll
  wrappers fixed here.
