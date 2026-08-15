# Reassign Users on Department Delete

Date: 2026-07-22

## Why
Previously, deleting a department was blocked if any active users were assigned to it. This forced administrators to manually reassign users before deleting a department, which was tedious. Admins wanted the ability to delete a department and have its users automatically reassigned to an "Unspecified" department, after confirming with a warning dialog.

## What changed
- [departments.ts](file:///media/sf_OrkaVault/backend/src/routes/departments.ts):
  - Updated `GET /api/departments` to calculate and return `userCount` for each department.
  - Updated `DELETE /api/departments/:id` to check if any users are currently assigned to the department. If so, and the department is not "Unspecified", it ensures the "Unspecified" department exists, reassigns all affected users to it, and deletes the requested department. If deleting "Unspecified" itself, it blocks deletion if there are still users assigned to it.
- [Settings.jsx](file:///media/sf_OrkaVault/frontend/src/pages/Settings.jsx):
  - Replaced the browser `confirm` dialog with a custom premium modal.
  - If the department to delete has active users, it warns the admin that those users will be moved to "Unspecified" department, and requires typing "Yes" to enable the Delete button.
  - If the department has no users, it shows a simple confirmation message.
