# Fix remaining horizontal-scroll spots after the mobile pass
Date: 2026-07-21

## Why
Follow-up to the mobile-responsive shell work: the shell itself (sidebar
drawer, Vault 3-pane) was fixed, but several individual pages/components
still had rows that don't shrink or wrap, so narrow viewports triggered
horizontal scrollbars in multiple unrelated places.

## What changed
- `frontend/src/index.css`:
  - `select, input, textarea { min-width: 0; }` (base layer) — form
    controls default to a content-based min-width, which is what let
    filter rows with two `<select>`s side by side force their container
    wider than the viewport regardless of `flex-1`/shrink settings.
  - `.menu` (notification/profile dropdown) gets `max-width: calc(100vw
    - 24px)` so it can't extend past the left edge of narrow phones.
  - `.modal`/`.modal-b`/`.scrim` get `overflow-x: hidden` plus a default
    `max-width` fallback, so nothing inside a modal can force the page
    to scroll sideways.
  - `html, body { overflow-x: hidden }` as a last-resort backstop.
  - ≤480px: shrink the top bar (padding, icon buttons, brand dot, role
    toggle) instead of letting hamburger + brand + role toggle + theme +
    bell + profile overflow a ~375px phone; ≤400px drops the Vault/Manage
    role toggle entirely (same switch is reachable from the sidebar's
    nav items, so nothing is lost).
- `frontend/src/pages/Audit.jsx`, `WorkspaceActivity.jsx`: their filter
  bars (`flex space-x-4` with 2-3 `<select>`s + a button) were an
  unconditional single row with no wrap — changed to `flex flex-wrap
  gap-4` with `flex-1 min-w-[160px]` filter cells, so they wrap onto
  multiple lines instead of overflowing.
- `frontend/src/pages/Settings.jsx`: the department-rename row had a
  hardcoded `w-64` input sitting next to action buttons in a
  `justify-between` row — switched to `flex-1 min-w-[140px] max-w-xs`
  and let the row wrap.
- `frontend/src/components/AddEntryModal.jsx`, `EditEntryModal.jsx`: the
  QR-upload file input + "Image uploaded/present" badge row now wraps
  (`flex-wrap gap-2`) instead of a fixed `space-x-3` row.
- `frontend/src/components/NotificationBell.jsx`: dropped the hardcoded
  `minWidth: 320` inline style in favor of `width: 320` +
  `maxWidth: calc(100vw - 24px)`, matching the new `.menu` CSS.

## Notes / gotchas
- Same sandbox caveat as the prior two entries: no browser tool and no
  local Postgres here, so this is verified by static audit (grepped
  every page/component for unwrapped `flex`/fixed-width rows next to
  form controls or buttons, read the surrounding JSX, and reasoned
  through the CSS cascade) plus confirming every touched file still
  transforms cleanly through Vite. Please verify visually — resize down
  to ~375px and ~320px widths — since I can't screenshot this myself.
- Didn't find (or didn't fix) any remaining overflow sources in
  Directory.jsx, Users.jsx, Collections.jsx, ManagerCollections.jsx,
  Approvals.jsx, Health.jsx, Profile.jsx, Login.jsx, Register.jsx — they
  already used wrapping/responsive Tailwind classes (`flex-col
  sm:flex-row`, `grid-cols-1 md:grid-cols-*`, `overflow-x-auto` on their
  tables). If a specific page still scrolls sideways after this, it's
  most likely one of those and worth flagging with a screenshot so I can
  target it directly next time (no browser access here to reproduce it
  myself).
