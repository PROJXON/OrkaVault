# Collections Management: expandable account manifest + deep link to Vault
Date: 2026-07-28

## Why
Follow-up to [[2026-07-28-collection-account-cross-links]], which added
account names to the Collections page but only as a plain comma-separated
string crammed into a table cell — hard to scan, and not actionable.
Ask: make the attached-accounts list look better, let a collection
expand to reveal its accounts, and let clicking an account jump straight
to that entry on the Vault page.

## What changed
- `backend/src/routes/collections.ts`: `GET /api/collections`'s `accounts`
  include now also selects `username`, `platformType`, `healthLabel`
  (previously just `id`/`name`) so each account can render as a real
  chip, not just a name.
- `frontend/src/index.css`: new `.coll-row`/`.coll-chevron`/
  `.coll-collapse` (accordion) and `.acc-panel`/`.acc-grid`/`.acc-chip`
  (chip grid) rules, built from existing OrkaOS tokens — no new palette.
  The collapse animates via the `grid-template-rows: 0fr → 1fr` trick
  (no JS height measurement, degrades to instant show/hide on browsers
  that don't animate grid tracks).
- `frontend/src/pages/Collections.jsx`:
  - Clicking a collection's row (desktop table) or header (mobile card)
    now expands an inline manifest of its accounts as a responsive grid
    of chips (icon, name, username · platform, health pill, arrow
    affordance) — mirrors the visual grammar already used for Vault
    catalog cards (`cat-card`) and dashboard `mini-row`s, so it reads as
    part of the same product rather than a bolted-on table feature.
    Row is keyboard-operable (`role="button"`, `tabIndex`, Enter/Space).
  - Clicking an account chip calls `navigate(\`/vault?select=${id}\`)`.
  - Edit/Delete icon clicks now `stopPropagation()` so they don't also
    toggle the row's expand state; opening the edit form auto-closes the
    accounts panel and vice versa (`toggleEdit`/`toggleExpand` both call
    the other's reset), so a row only ever shows one expansion at a time.
- `frontend/src/pages/Vault.jsx`: new effect reads a `?select=<id>`
  query param on load — once accounts are fetched, if `id` matches a
  loaded account it calls the existing `selectAccount(id)` (same helper
  the catalog list itself uses) and strips the param from the URL via
  `replace: true`. This is what Collections' account chips navigate to.

## Verification
Sandbox can't run the frontend dev server here (Windows-built esbuild
binary in `node_modules`, pre-existing environment limitation — see
memory). Verified instead by parsing both changed `.jsx` files with
`@babel/core` (`parserOpts: { plugins: ['jsx'] }`) to catch syntax
errors, and `tsc --noEmit` for the backend route change. Not a
substitute for clicking through it — recommend a quick manual pass in
the real app (expand a collection with accounts, click one, confirm it
lands on that entry in the Vault workspace pane).
