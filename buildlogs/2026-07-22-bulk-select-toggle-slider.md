# Bulk Select Slider, Users & Roles Tabs, and Mobile Modal layout fix
Date: 2026-07-22

## Why
1. Users wanted to toggle the visibility of the "select multiple" checkboxes for bulk deletion/actions to keep the interface cleaner.
2. In the "Users & Roles" console, the user status display was refactored into "Active" and "Deactivated" tabs to simplify user management and remove the redundant status column. Deactivated users need an easy restore workflow.
3. The layout was refined so that the search, department filters, and bulk select switch appear below the tabs and above the user list rather than in the header.
4. On mobile screens, the User Edit and Bulk Delete confirmation modals were vertically centered on the viewport (`items-center`), causing the top of the modals to be cut off by the top navigation bar. We want them aligned to start below the navbar on mobile, and scrollable/fully visible.

## What changed
- **Vault catalog** ([Vault.jsx](file:///media/sf_OrkaVault/frontend/src/pages/Vault.jsx)): Added `showBulkSelect` state and a toggle switch in the catalog pane toolbar next to "Favorites only", controlling the visibility of the select-all checkbox, the delete button, and the per-item checkboxes.
- **Users console** ([Users.jsx](file:///media/sf_OrkaVault/frontend/src/pages/Users.jsx)):
  - Added `showBulkSelect` state and a toggle switch controlling the visibility of the multi-select checkboxes.
  - Added `activeTab` state (Active/Deactivated tabs) to separate active/pending users from deactivated users.
  - Moved the search, department filters, and bulk select toggle container to render below the tabs row and above the user list table/cards for better UX flow.
  - Removed the dedicated Status column from both mobile card and desktop table views.
  - Added a visual `Pending` badge to the Name column for pending users.
  - Disabled the role and department dropdowns for deactivated users.
  - Added a "Restore" button to the actions column/actions block in mobile and desktop lists for deactivated users to reactivate/approve them.
  - Re-styled the modals container wrapper from `items-center` to `items-start pt-20 pb-10 sm:items-center sm:pt-4 sm:pb-4` and added `my-4` to the card, which shifts the popups down safely below the top navigation bar on mobile viewports while preserving standard vertical centering on larger desktop viewports.
