# Documentation section + API policy updates (Phase 4d)

## Why

4c shipped an external audit API with no user-facing documentation, and
the policies didn't mention it or the new sign-in/security audit events.
This adds an in-app Documentation section (REST API docs for admins,
in-app policy pages, FAQ placeholder) and the TERMS anchor the new policy
text depends on. Plan: `plan/phase-4d-documentation-and-policy-updates.md`.
No schema change.

## What changed

**Backend**
- `routes/docs.ts` at `/api/docs` (`requireAuth`, `no-store`): GET
  `/rest-api` [ADMIN] → `{markdown, actions, apiVersion, externalApiEnabled}`.
  `actions` is `config/auditActions.ts` grouped by category, so the catalog
  always matches the code. Mounted in `index.ts` before misc `/api`.
- `src/docs/rest-api.md`: overview, auth, both endpoints (params, response
  fields, curl + Node 18 `fetch`), polling guide (durable cursor, dedupe,
  30 s settle window, `/status` retention check, `seq` gaps), errors +
  retry policy, rate limits, rotation/expiry/leak runbook, terms link,
  changelog. Read once at startup (src/docs fallback for `dist/`, same as
  content-seed). Contains no hostnames or env var names; the frontend
  replaces `{{AUDIT_BASE_URL}}` with `${API_BASE_URL}/external/v1/audit`.
- `config/contentRegistry.ts`: TERMS `requiredAnchors` now
  `["monitoring", "api"]`.

**Frontend**
- `components/legal/LegalDocument.jsx`: the policy body pulled out of
  `LegalPage.jsx` (load, `VersionMeta`, draft banner, Cookie settings
  button, Markdown) as a render prop. `LegalPage` = `LegalLayout` +
  `LegalDocument`; behaviour unchanged.
- `components/docs/DocsArticle.jsx`: in-app card + sticky "On this page"
  TOC + `#hash` scrolling.
- `pages/docs/`: `DocsHome` (`/docs`), `RestApiDocs` (`/docs/api`),
  `PoliciesIndex` (`/docs/policies`), `PolicyDoc` (`/docs/policies/:page`),
  `docsNav.js` (`DOC_POLICIES`, shared with the sidebar).
- `Sidebar.jsx`: "Documentation" group with nested items (`children`,
  `disabled`/`comingSoon`), chevron toggle, `orka.nav.docsPolicies` in
  localStorage (try/catch), auto-open on a policy page.
- `index.css`: `.legal-prose pre` code-block styles (there were none),
  table spacing, nested-nav / disabled-item styles incl. collapsed rail and
  mobile drawer overrides.

**Docs:** `ARCHITECTURE.md` (route table, src/docs, pages, sidebar,
`LegalDocument`, "where to make changes" rules), `CLAUDE.md` convention.

## Notes / gotchas

- **Deviation from the plan:** `/docs/api` is not wrapped in
  `ProtectedRoute allowedRoles={["ADMIN"]}`. That would redirect a USER to
  `/vault`, so the plan's "visiting `/docs/api` → Admins only" check could
  never pass. `RestApiDocs` checks the role itself (UX), shows "Admins
  only" without fetching, and still handles a server 403 the same way. The
  server route is the gate either way.
- An admin previewing as USER/MANAGER (`viewAsRole`) sees "Admins only"
  and no sidebar item, matching every other admin page.
- Policies in the app link out to `/legal/...` (Markdown links and
  "Previous versions"), as planned. "Public page" button opens the
  printable `/legal/:page`.
- **Verified in the sandbox:** backend `tsc --noEmit` clean; TS
  syntax-only parse of every changed JSX/JS file; all lucide icon names
  exist. Not run: the curl 401 check (the backend wouldn't start without
  local env, and the user chose to test in prod), anything rendered.
- **Deploy order:** deploy 4d first, then an admin applies the plan's §5
  drafts in Settings → Content and publishes TERMS, PRIVACY and NOTICE
  with "Publish & require re-acceptance". A TERMS draft without
  `## API keys and integrations {#api}` is now rejected at publish. Users
  get one combined prompt.
