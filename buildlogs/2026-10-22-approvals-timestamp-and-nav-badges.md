# Approvals timestamp + sidebar nav badges

Phase 1 of `plan/` (NEW.md requests). No schema change.

## Why
- The Pending Approvals page didn't show when a request was made.
- Approvals had no sidebar badge, so pending requests were easy to miss.
- The Users & Roles badge already existed, but it downloaded the full user
  list every 60s just to count it, and stayed stale after an approve/decline
  until the next poll or navigation.

## What changed
- `backend/src/routes/requests.ts`: pulled the Manager/Admin `where` into
  `staffRequestScope()` so the list and the count use the same scope.
  Added `GET /api/requests/pending-count` [MANAGER/ADMIN], which uses
  `accessRequest.count` with that scope plus `status: PENDING`. A manager's
  badge only counts requests in their managed collections.
- `backend/src/routes/users.ts`: added `GET /api/users/pending-count` [ADMIN]
  (`active: false, revoked: false`, the same "pending" definition as `Users.jsx`).
- `frontend/src/lib/navBadges.js` (new): `refreshNavBadges()` dispatches the
  `orkavault:badges-refresh` window event.
- `frontend/src/components/Sidebar.jsx`: loads both counts from the new
  endpoints with `Promise.allSettled`, so each fails on its own. They load
  on a 60s poll, when the route changes, and when the refresh event fires.
  The Approvals item gets a badge, and each item has its own badge tooltip text.
- `frontend/src/pages/Approvals.jsx`: added a "Requested" column on desktop
  and a field on mobile. Each shows the local date/time, a relative hint, and
  the ISO time on hover. Approve and deny now refresh the badges.
- `frontend/src/pages/Users.jsx`: approve, decline, deactivate and bulk-delete
  now refresh the badges.
- `ARCHITECTURE.md`: added both new routes to the route table.

## Verification
Backend `tsc --noEmit` passes. The changed frontend files parse cleanly.
The UI still needs to be tested locally on Windows.
