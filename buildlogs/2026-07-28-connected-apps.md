# Connected Apps view (Workspace Activity)
Date: 2026-07-28

## Why
`services/googleWorkspace.ts`'s existing Reports API polling
(`ingestWorkspaceActivity`) only captures new login/OAuth-grant *events*
going forward — it can't show a third-party app a user connected before
monitoring existed. The user wanted a current-state view: for every
Workspace account, which apps are connected right now. This is the
Directory API's `tokens.list(userKey)`, called out as a future addition
in `docs/google-workspace-admin-sdk-monitoring.md` §1 but never built
until now.

Decisions from the user for this feature:
- Scope: all Workspace users org-wide (same precedent as Phase 2's
  event ingestion), not just users who already have an OrkaVault
  account — requires enumerating the full directory via `users.list()`.
- Read-only for this pass — no "Revoke" (`tokens.delete`) action yet;
  land the raw view, decide on a revoke flow later.

## What changed
- `backend/prisma/schema.prisma`: new `ConnectedApp` model — a
  current-state snapshot (unique on `userEmail`+`clientId`), not an
  append-only log like `WorkspaceActivityEvent`.
- `backend/src/services/googleWorkspace.ts`:
  - Added `admin.directory.user.readonly` to `SCOPES` (needed to
    enumerate the full Workspace directory; `tokens.list`/`tokens.delete`
    themselves are already covered by the previously-authorized
    `admin.directory.user.security` scope).
  - `listActiveWorkspaceUsers()` — paginates Directory API `users.list`,
    skips suspended accounts.
  - `fetchConnectedApps(userEmail)` — Directory API `tokens.list`,
    normalizes `Schema$Token` fields.
  - `syncConnectedApps()` — new cron entry point: for each active user,
    upserts current `ConnectedApp` rows and deletes any not returned in
    this sync (i.e. the app was disconnected).
  - Also fixed a real bug in `ingestWorkspaceActivity()` found while
    debugging why only two admin accounts' events were showing: the
    cron anchored its `since` cursor to the single most-recent ingested
    event's timestamp across *all* users. Once the admin accounts'
    frequent test activity pushed that watermark forward, any other
    user's earlier activity became permanently unreachable — Google's
    Reports API was always queried for "since <watermark>", which had
    already raced past it. Replaced with a rolling 24h lookback window,
    deduped via the existing `alreadyIngested()` check.
- `backend/src/index.ts`: registers `syncConnectedApps` — runs on
  startup, then every 6h (connected-apps data changes far less often
  than security events, unlike the 30-min activity-log cron).
- `backend/src/services/googleWorkspace.ts` (follow-up): extracted the
  upsert/delete-stale logic out of `syncConnectedApps()`'s loop body into
  `syncConnectedAppsForUser(userEmail)`, a standalone exported function.
  `syncConnectedApps()` now just calls it per user; the route layer also
  calls it directly for one user at a time (see below) instead of only
  having an all-users entry point.
- `backend/src/routes/workspaceActivity.ts`: new
  `GET /api/workspace-activity/connected-apps` [ADMIN], optional
  `userEmail` filter (reads the DB only, no live Google call). Then two
  rounds of follow-up based on user testing:
  1. `POST /connected-apps/sync` [ADMIN] — runs `syncConnectedApps()`
     (all users) synchronously then returns the refreshed rows; added
     after the user first tried the tab and saw nothing (table was just
     empty since only the 6h cron had populated it, not a bug).
  2. `GET /connected-apps/users` and `POST /connected-apps/sync/:userEmail`
     [ADMIN] — added after the user found the all-users sync too slow.
     `/users` is fast (one `users.list` call + one grouped DB query) and
     lists every account with its last-known app count; `/sync/:userEmail`
     does the actual `tokens.list` call for just one account. The user
     then decided they preferred seeing accurate counts for everyone up
     front over the faster initial load, so the frontend went back to
     calling all-users `POST /connected-apps/sync` on tab load (see
     below) — but `/sync/:userEmail` stayed, now used by the "Refresh"
     action on a single expanded account. `POST /connected-apps/sync`
     (all-users) is the one both the tab-load path and the manual "sync
     everything" escape hatch use.
- `frontend/src/pages/WorkspaceActivity.jsx`: split into tabs (pattern
  copied from `Settings.jsx`) — existing table is now `ActivityLogTab`.
  `ConnectedAppsTab` is a master-detail view, not a flat table: on load,
  syncs every account once (`POST /connected-apps/sync`) and groups the
  result client-side by `userEmail` so every account's count is accurate
  immediately and expanding any account afterward needs no further
  network call. Clicking an account just toggles its expanded state
  (desktop: expanding table row; mobile: expanding card) to show its
  apps. A per-account "Refresh" link re-syncs just that one account
  on demand (`POST /connected-apps/sync/:userEmail`) without reloading
  the whole tab.
  - **Bug found + fixed**: the first version of `/sync/:userEmail`
    called `syncConnectedAppsForUser()` and returned its raw return
    value directly, which at the time was the *fetched-from-Google*
    shape (`clientId`/`appName`/`scopes`/...) — missing `id` and
    `lastSeenAt`. `ConnectedAppRow` calls `format(new Date(app.lastSeenAt), ...)`;
    with `lastSeenAt` undefined that's an invalid date, and `date-fns`'s
    `format()` throws on invalid dates — an uncaught render error with no
    error boundary, which blanks the entire page. Fixed by having
    `syncConnectedAppsForUser()` return the persisted Prisma rows
    (`prisma.connectedApp.findMany({where: {userEmail}})`) instead of the
    raw fetch result, so every caller gets the same shape as the GET
    endpoints. Worth remembering for any future endpoint that returns a
    service function's result directly: check whether that function
    returns the *external API's* shape or the *persisted* shape before
    assuming they match.
- `docs/workspace-dwd-scopes.txt` and
  `docs/google-workspace-service-account-setup.md`: updated the
  copy-paste scope string to the new 3-scope list.
- `ARCHITECTURE.md`: added `ConnectedApp` to §4, the new functions/cron
  to §2's `googleWorkspace.ts` service entry and cron list, and the new
  endpoint to the `/api/workspace-activity` route row.

## Notes / gotchas
- **Manual step, now done**: the Workspace Admin Console's Domain-wide
  Delegation entry for this service account's Client ID needed the new
  `admin.directory.user.readonly` scope added to its existing scope list
  (edit in place, not a second entry) — copy-paste string is in
  `docs/workspace-dwd-scopes.txt`. Confirmed working end-to-end
  (`unauthorized_client` during setup, resolved once the scope was
  actually present — see troubleshooting note below).
- `unauthorized_client` while wiring this up wasn't a code problem or a
  wrong scope name — `admin.directory.user.readonly` is correct per
  Google's own Admin SDK docs. If this recurs for a future scope
  addition: the DWD scopes field takes a single comma-separated string
  in one entry per Client ID (not one entry per scope, not space
  -separated), and Google says authorization changes can take up to
  15–60 minutes to propagate. Check both before assuming the scope name
  itself is wrong.
- No Postgres in this sandbox — `npx prisma generate` was run
  (schema-only, confirms the client compiles) but `npm run prisma:db`
  needs to be run against a real database to actually create the
  `ConnectedApp` table before this works.
- Backend type-checks clean (`tsc --noEmit`). Frontend could not be
  verified with a running Vite dev server in this sandbox — its
  `node_modules` has a Windows-built `esbuild` binary (`@esbuild/win32-x64`
  present, `@esbuild/linux-x64` missing), a deeper cross-platform mismatch
  than the vboxsf npm-corruption issue CLAUDE.md already documents, and
  not something to paper over here. (A `@rollup/rollup-linux-x64-gnu`
  binary was missing too and was fixed with the documented `npm pack` +
  extract recipe, but the esbuild platform mismatch is a different,
  larger problem — likely because this frontend's `node_modules` was
  installed on a Windows host and is being read here over the vboxsf
  share.) Verified instead by careful manual read-through plus a brace/
  paren-balance check; hasn't been run in a browser.
- The original sync-on-visit design (item 1 above) called Google's
  Directory API once per active user synchronously inside one HTTP
  request — the user found this too slow in practice, which is what
  drove the per-account lazy design (item 2). The all-users `POST
  /connected-apps/sync` route still has this same synchronous-per-user
  cost; fine as an occasional manual escape hatch, not something to
  wire back into the tab's default flow.
- **Follow-up: parallelized the sync.** `syncConnectedApps()`'s per-user
  loop was fully sequential (one `tokens.list` round-trip at a time),
  which is what made the full-org sync slow enough that the user asked
  about it. Confirmed first that Admin SDK Directory/Reports API calls
  aren't billed by GCP at all (included with the Workspace subscription,
  no pricing listed in Google's docs) — the only real constraint is rate
  limiting, not cost. Added:
  - `mapWithConcurrency()` — a small hand-rolled bounded worker pool (no
    new dependency), used instead of a sequential `for` loop or an
    unbounded `Promise.all` (which would risk a burst of 429s).
    `CONNECTED_APPS_SYNC_CONCURRENCY = 10` users in flight at once.
  - `withRetry429()` — wraps the two actual Google network calls
    (`directory.users.list` in `listActiveWorkspaceUsers()`,
    `directory.tokens.list` in `fetchConnectedApps()`) with exponential
    backoff + jitter, honoring a `Retry-After` header if Google sends
    one; only retries on 429, anything else propagates immediately.
    Five retries max before giving up on that one call.
- **Follow-up: Manage Console dashboard widgets.** Added a Connected
  Apps section to `ManageConsole.jsx` (ADMIN-only, alongside the
  existing directory-metrics charts): a pie chart of Workspace accounts
  by connected-app count, and a Top 5 Connected Apps list. Backend: new
  `GET /api/workspace-activity/connected-apps/top` [ADMIN] — aggregates
  cached `ConnectedApp` rows by `appName` (falls back to `clientId` when
  Google didn't report a display name), `limit` query param (default 5,
  max 20). The pie reuses the existing `/connected-apps/users` endpoint.
  Neither endpoint triggers a live Google sync — both just read whatever
  the 6h cron or a Workspace Activity tab visit already populated, so
  visiting the Manage Console (likely a frequent landing page) never
  incurs the full-org sync cost. Capped the pie to the top 10 accounts +
  an "Other" slice rather than one slice per account, since a literal
  per-account pie would get unreadable as the org grows.
- **Follow-up: fixed Activity Log getting crowded out by token-exchange
  noise.** The user reported the Activity Log tab (Reports API
  login/token events, `ingestWorkspaceActivity`) had regressed — only
  `oauth_token_grant` events for one account were visible, no logins, no
  other users, where previously all of that showed fine. Root cause:
  `getAuthClient()` built a brand-new `JWT` instance (and per
  `google-auth-library`'s `refreshTokenNoCache`, forced a brand-new OAuth
  token exchange) on **every single call**, with zero reuse. Before
  Connected Apps existed this only ran ~twice per 30-min cron tick — easy
  to miss. `syncConnectedApps()` calls it once per active Workspace user,
  concurrently; every sync (Manage Console load, Workspace Activity tab
  visit, or the 6h cron) was therefore firing a burst of fresh token
  exchanges impersonating the same admin subject, all in a tight window.
  The 24h rolling-window fix from earlier then dutifully re-scanned and
  ingested that burst as real `oauth_token_grant` `WorkspaceActivityEvent`
  rows for that one account, which — being the most recent by
  `occurredAt` — pushed genuinely older/other-user login events out of
  the Activity Log tab's `?limit=200` window entirely (nothing was
  actually deleted, just crowded out of the visible slice).
  - Fix: `getAuthClient()` now caches a single `JWT` instance for the
    process lifetime instead of rebuilding one per call —
    `google-auth-library`'s client already handles its own token
    caching/refresh internally when reused, so this is the intended
    usage pattern, not a workaround. Cuts token-endpoint round trips from
    "one per Google API call" to "about one per hour" (whenever the
    cached token actually expires).
  - Added `backend/src/scripts/cleanupWorkspaceTokenNoise.ts` — dry-run
    by default (lists `oauth_token_grant` rows for
    `GOOGLE_WORKSPACE_ADMIN_EMAIL` grouped by `appName` + count so the
    noisy one is identifiable), `--delete --appName="<value>"` to purge
    just that one. User confirmed the noisy `appName` was a raw numeric
    value (`113051081406004416859`) — exactly what Google shows for an
    OAuth client with no registered display name, consistent with it
    being the service account's own Client ID rather than a real app.
  - **Deleting didn't stick — found a second, more important bug.** The
    24h rolling lookback window (from the earlier watermark fix) means
    `ingestWorkspaceActivity()` re-fetches everything Google still
    reports in the last 24h on *every* 30-min poll. Deleting our copy of
    a row only removes the "already ingested" dedup marker
    (`alreadyIngested()`) — Google still has the same historical event in
    its own audit log, so the very next poll just re-inserts it. Manual
    deletion alone can never win against that within the same 24h window.
    Fixed at the source instead: `getOwnClientId()` reads the service
    account's own `client_id` out of the already-cached key file (see
    `getServiceAccountKey()`, factored out of `getAuthClient()` so both
    share one cached read), and `ingestWorkspaceActivity()` now filters
    out any event whose `appName` equals it *before* the ingest loop even
    runs — so this specific noise can never be re-created regardless of
    the rolling window. The one-off script above is still needed once to
    clear out rows already inserted before this filter existed.
- Revoke (`tokens.delete`) intentionally deferred — uses the same
  already-authorized `admin.directory.user.security` scope as
  `tokens.list`, so it's a code-only follow-up whenever wanted, no
  further Admin Console changes needed for that part specifically.
