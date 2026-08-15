# Security Dashboard Relocation and Directory Refinements
Date: 2026-07-22

## Why
1. Admins wanted a unified high-level dashboard. The metrics and charts from the Personnel Directory page were relocated directly to the landing page of the Manage Console for better visibility, keeping the Directory page focused strictly on browsing personnel list and managing grants.
2. Formatted uppercase roles to title case ("Admin", "Manager", "User") for cleaner display.
3. Enhanced the personnel dossier slide-over view on the Directory page to show "Member since" and "Last Activity" for better auditing context.
4. On mobile screens, the role filter buttons in the Directory page were causing horizontal side-scrolling. Converting them to a responsive select dropdown improves the mobile UX layout.

## What changed
- **Manage Console** ([ManageConsole.jsx](file:///media/sf_OrkaVault/frontend/src/pages/ManageConsole.jsx)):
  - Added state to fetch directory metrics.
  - Rendered the security metrics cards grid and the three charts (Audit Activity, Health Distribution, Global Access Ratio) directly underneath the Manage Console header, above the console tiles.
  - Omitted the "Security Dashboard" label/description to integrate cleanly.
  - Enlarged the layout container to `max-w-7xl` to fit the charts nicely.
- **Personnel Directory API Route** ([directory.ts](file:///media/sf_OrkaVault/backend/src/routes/directory.ts)):
  - Added `createdAt` and user's latest `auditLog` timestamp to the returned directory query result mapping under `lastActive`.
- **Personnel Directory** ([Directory.jsx](file:///media/sf_OrkaVault/frontend/src/pages/Directory.jsx)):
  - Removed all chart imports, chart registration, chart calculations, metrics grid, and chart views.
  - Added a simplified and consistent header title "Personnel Directory".
  - Defined `formatRole` helper to display roles in title case ("Admin", "Manager", "User") on card tags, filter buttons, and dossiers.
  - Added a "Member since [Month] [Year]" badge under the "Verified Active" status in the profile slide-over.
  - Rendered a new "Last Activity" section utilizing a `Clock` icon and the user's latest audit log timestamp.
  - Wrapped the role filter button bar in `hidden md:flex` and added a `block md:hidden` select dropdown wrapper for mobile viewports to prevent side scrolling.
