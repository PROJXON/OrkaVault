# Trim Workspace Activity tab descriptions + fix mobile app-name overflow
Date: 2026-07-28

## Why
The Activity Log / Connected Apps / Devices tab intros on
`/workspace-activity` were multi-sentence paragraphs explaining
implementation details (inferred-device heuristics, sync cadence,
Workspace-monitoring prerequisites, snapshot-vs-event-log distinctions).
Every other admin page in the app (Health, Audit, Requests, Collections)
uses a single short sentence. Asked to match that.

## What changed
- `frontend/src/pages/WorkspaceActivity.jsx`: shortened all three tab
  intro paragraphs to one sentence each, in the same style as sibling
  pages:
  - Activity Log: "Google Workspace logins and OAuth app grants ingested
    for your organization."
  - Connected Apps: "Every active Workspace account and its currently
    connected third-party apps."
  - Devices: "Devices associated with each Workspace account, synced
    from Google."
- The dropped detail (inferred-device caveat, snapshot-vs-event-log
  distinction, sync cadence, Workspace-monitoring prerequisite) is
  either already surfaced elsewhere in the UI (e.g. the "Likely Device"
  field already carries its own `title` tooltip) or was implementation
  trivia not needed to use the page — see [[project_workspace_features_state]]
  and [[project_workspace_reports_api_device_location]] in memory if that
  context is needed again later.

## Follow-up: mobile horizontal scroll on long app names
`ConnectedAppRow` (used by the Connected Apps tab's mobile `row-card`
list) rendered the app name in a `flex items-center justify-between`
row with no `min-width: 0` on the name `<span>`. Flex items default to
`min-width: auto`, so a long unbroken app name or raw OAuth client ID
(e.g. `1234567890-abc...apps.googleusercontent.com`) refused to shrink
or wrap and pushed the row — and the page — wider than the viewport,
creating horizontal scroll on mobile.
- `frontend/src/pages/WorkspaceActivity.jsx` (`ConnectedAppRow`):
  changed the row to `items-start`, added `min-w-0 break-words` to the
  name span so it can shrink and wrap onto multiple lines, and
  `shrink-0` on the "Native" badge so it stays fixed-size instead of
  getting squeezed as the name wraps.
