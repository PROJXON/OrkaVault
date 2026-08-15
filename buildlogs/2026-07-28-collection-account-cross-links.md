# Show collection <-> account relationships in the UI
Date: 2026-07-28

## Why
Collections and vault entries were only linked one-directionally in the
UI: the admin Collections page showed a bare account *count* per
collection (no names), and a vault entry showed nothing about which
collection it belonged to or who currently manages that collection.

## What changed
- `backend/src/routes/collections.ts`: `GET /api/collections` now also
  includes `accounts: { id, name }` (sorted by name) on each Collection,
  alongside the existing `_count.accounts` and `managers`.
- `frontend/src/pages/Collections.jsx`: the "Items" column (desktop
  table + mobile cards) is now "Accounts" and lists the attached account
  names (with the count kept for a quick glance), not just a number.
- `frontend/src/pages/Vault.jsx`:
  - Catalog cards now show a badge with the entry's collection name
    (via a `collectionsById` lookup built from the already-fetched
    `/collections` list — no extra request).
  - The entry detail pane shows a line with the collection name and its
    current managers (or "Not in a collection" / "None assigned").
- Also fixed a duplicate-sibling-key bug in the same reveal block
  (`RevealOtp`/`RevealPassword`/`AdminQrModal` were all keyed
  `selected.id`) while touching this code — see
  [[2026-07-28-reveal-duplicate-key-and-click-outside]].
