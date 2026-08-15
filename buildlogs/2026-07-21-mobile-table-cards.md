# Add mobile card layout for wide admin tables
Date: 2026-07-21

## Why
The previous responsive pass gave wide tables (Approvals, Users & Roles,
Collections, Health Audit, Audit Log, Workspace Activity) an
`overflow-x-auto` wrapper so they wouldn't blow out the page, but that
just relocated the problem — on a phone you still had to side-scroll
within the table to read every column. Asked to give these an actual
mobile-only layout instead of a scrolling table.

## What changed
- `frontend/src/index.css`: new `.row-cards`/`.row-card`/`.row-card-field`
  (label left, value right, wraps instead of scrolling)/`.row-card-actions`
  classes — a reusable "stacked spec sheet" tile for turning one table
  row into one card.
- `frontend/src/pages/{Approvals,Users,Collections,Health,Audit,
  WorkspaceActivity}.jsx`: each now renders the data twice — a `.row-cards`
  list (`md:hidden`) with one card per row, and the existing `<table>`
  wrapper (now `hidden md:block`) unchanged for ≥768px. Same loading/empty
  states and the same action buttons (Approve/Deny, Edit/Deactivate,
  Re-evaluate, etc.) in both renderings; Users' Role/Department table
  cells are interactive `<select>`s, so the card version keeps them as
  live selects rather than flattening them to text.

## Notes / gotchas
- Same sandbox caveat as the prior three entries in this series: no
  browser tool and no local Postgres here. Verified every touched file
  transforms cleanly through Vite; the actual card layout (spacing,
  wrapping of long values) hasn't been visually confirmed. Worth a
  resize-to-375px check on all six pages once you can run it locally.
- Two renderings of the same list means two places to update if a
  column/action ever changes on these pages — accepted the duplication
  since a CSS-only table-to-block transform (e.g. `display:block` +
  `data-label` pseudo-elements) would've been more fragile and harder to
  keep visually consistent with the rest of the OrkaOS component set.
- Directory.jsx wasn't touched here — it never used a `<table>` (it's
  already a responsive card grid), so it didn't have this problem.
