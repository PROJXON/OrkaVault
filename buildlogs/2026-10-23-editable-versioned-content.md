# Admin-editable policies and banners: drafts, timestamped versions, re-acceptance (Phase 4b)
Date: 2026-10-23

## Why
The user wants every policy page and every legal/notice banner to be editable by the ADMIN in the app, with no code change or deploy. Their rules:
- every edit is a draft users never see;
- changes go live only on a button press. Policies get "Publish & require re-acceptance" (primary) or "Publish minor fix" (secondary, no re-prompt); banners get "Publish";
- every published version is timestamped and kept forever;
- users can see the exact versions they accepted.

Before this, the text was hardcoded JSX, and versions were hand-bumped in two files that had to match (`frontend/src/lib/legalVersions.js`, `backend/src/config/legalVersions.ts`). Plan: `plan/phase-4b-admin-editable-legal-documents.md`.

## What changed
- **Schema** (schema.prisma only; no migration folder, because prod runs `prisma db push`):
  - new `ContentVersion` (immutable), `ContentDraft` (one per key) and `ContentAcceptance` (`onDelete: Restrict` to its version);
  - User relations to all three;
  - Phase 4's four User acceptance columns marked `// deprecated (Phase 4b)` and **kept**, because dropping columns that hold data fails `db push`.
  - Client regenerated.
- **Backend**
  - `config/contentRegistry.ts`: 4 policies + 5 banners, each with kind, acceptance, maxLength and requiredAnchors.
  - `config/content-seed/*.md`: today's text converted to Markdown:
    - `<Tbd>` becomes `[TBD: …]`;
    - `<Link>` becomes a `/legal/...` link;
    - `LEGAL_CONTACT` is inlined;
    - every heading keeps its old anchor with an explicit `{#id}`.
  - `services/content.ts` (new):
    - in-process cache of version metadata, current rows and required versions (invalidated on publish, 60s TTL);
    - drafts and publishing, with validation: length, change note, required anchors, `[TBD` with the DRAFT banner off, no publishing an unchanged draft;
    - `headingIds()`, which mirrors the frontend's anchor ids;
    - `seedContent()`: v1 + backfill, idempotent, run at startup after the department seeding.
  - `services/legalAcceptance.ts` rewritten:
    - `pendingAcceptances` (one indexed query per request, required versions from the cache);
    - `hasPendingAcceptances`, `resolveCurrentVersions`, `recordAcceptances`;
    - writes `CONTENT_ACCEPTED` audit rows.
  - `middleware/auth.ts`: the gate uses `pendingAcceptances` and attaches `req.pendingAcceptances`. The SSE stream (`misc.ts`) and the Discord resolver (`integrations.ts`) use `hasPendingAcceptances`.
  - `routes/auth.ts`:
    - register takes `acceptedVersions: {TERMS, PRIVACY}` (both must be current) and creates the acceptance rows in the user's nested create;
    - `/me` and all login responses return `pendingAcceptances`;
    - `/acknowledge` takes `{acceptances: [...]}`, all pending at once.
  - `routes/content.ts` (new, `/api/content`, 512kb JSON limit). Public: `/current`, version list, exact version. Authed: `/me/acceptances`. ADMIN: summary, history, draft GET/PUT/DELETE, publish (`CONTENT_PUBLISHED` audit row with the hash).
  - Deleted `config/legalVersions.ts` and the `LEGAL_*_VERSION` env vars from `.env.example`.
- **Frontend**
  - `lib/contentRegistry.js`, `lib/content.jsx` (ContentProvider / useContent / formatVersion).
  - `components/ContentMarkdown.jsx`, the single safe renderer.
  - `components/LineDiff.jsx` (`diff`).
  - `components/ContentAdmin.jsx` (Settings → Content).
  - `components/MyAgreements.jsx` (Profile).
  - `LegalLayout` rewritten: the TOC is built from the rendered `h2[id]`s, and it exports `LegalDraftBanner`.
  - `Terms/Privacy/Cookies.jsx` replaced by `LegalPage.jsx` (`/legal/:page`) + `LegalVersions.jsx` (`/legal/:page/versions[/:version]`).
  - `SystemUseNotice.jsx` is now the general policy gate.
  - `SystemUseBanner`, `ConsentBanner` and the Register checkbox read their text from content.
  - `consent.js`: the consent version is the required COOKIES version.
  - Deleted `lib/legalVersions.js`.
  - CSS for blockquote notes, `ol`, heading scroll margins, the summary paragraph and the diff view.
- **Docs:** ARCHITECTURE (models, routes, services, registry, components, §5 gate + accepted risks, §6 how-to). README has no more version-file/env-var instructions. DEVHELP had none.

## Notes / gotchas
- **Nobody is re-prompted by the migration.** Seeded v1 is labelled `"2026-10-23"` with `publishedAt` 2026-10-23T00:00Z and `requiresReacceptance: true`. The backfill creates TERMS+PRIVACY v1 acceptances from `termsVersionAccepted` and NOTICE from `noticeVersionAcknowledged`, with `skipDuplicates`. As the plan says, TERMS/PRIVACY backfill rows use `via: "registration"` even for users who accepted at the Phase 4 gate. The old columns don't record which it was.
- **Cookie consent isn't reset either.** `setConsentVersion` maps the seeded COOKIES v1 to the old `CONSENT_VERSION = 1`, so stored choices stay valid.
- **The consent version is the *required* COOKIES version, not the current one** (the plan said current). Otherwise a COOKIES "minor fix" would re-show the cookie bar, which contradicts what a minor fix means.
- **Explicit heading ids** (`## Monitoring and logging {#monitoring}`) were added beyond the plan. Without them, rehype-slug would turn the existing anchors into `#monitoring-and-logging` etc. and break `TERMS#monitoring`, `PRIVACY#personal-vault` and `#data-we-collect`. A small remark plugin in `ContentMarkdown` handles them, and the backend's anchor check understands both forms.
- **Public responses hide internal change notes.** Only a re-acceptance version's note ("What changed") is public. Minor-fix and banner notes are labelled internal in the dialog, so `/current` and the public version list return `changeNote: null` for them.
- **Added beyond the plan:**
  - `/legal/notice`, a public page for the System Use Notice so "My agreements" can link to the exact NOTICE text;
  - `GET /api/content/:key/history` and `GET /api/content/admin/summary` (ADMIN), for the editor's history panel and list;
  - a NOTICE fallback in the frontend registry, because AC-8 needs the notice on screen even if the API is down.
- **The "no change" check covers title + DRAFT banner + body hash**, not just the hash. Turning the DRAFT banner off after legal sign-off, with the same text, is a real publish.
- **Seed .md files are read from `src/config/content-seed` at runtime.** tsc doesn't copy them into `dist/`. Render and the Dockerfile both keep `src/`.
- **Text changes in the seed files vs Phase 4:**
  - Privacy now lists policy acceptances under "Data we collect" and "How long we keep it" (the new table stores IP + time; ARCHITECTURE §6's rule);
  - Terms "Changes to these terms" says versions are publish timestamps with "Previous versions";
  - the Cookies "Managing your choices" button is now a "Cookie settings" header button on that page (UI chrome stays in code).
  - All still DRAFT.
- **First startup after deploy:** the server listens before `seedContent()` finishes, so for a moment `/content/current` is empty (banners show fallbacks) and register would 400. It's gone after the first seed.
- **After an admin presses "require re-acceptance"**, they're gated too on their next request (they're a user as well). Expected.
- **Multi-instance:** the content cache is per process; another instance picks up a publish within 60s.
- **Verified here:**
  - backend `tsc --noEmit` is clean;
  - a syntax-only parse of all 17 touched frontend files is clean;
  - a renderer smoke test in the session scratchpad (the four packages + react installed *there*, not in the project; real `ContentMarkdown.jsx` rendered server-side with esbuild) passes 21 checks: the seed anchors incl. `#monitoring` and `#personal-vault`, TBD spans, the cookies table, link rels, `diffStats`, and XSS probes (`<script>`, `javascript:`/`JaVaScRiPt:`/`data:`/`vbscript:` links, `<img onerror>`, a tracking pixel, `<iframe>`, `onclick`, `//evil`). All rendered inert.
  - Not run: the backend against a DB (none in the sandbox) and the app in a browser.
- The user needs to install `react-markdown@^10.1.0 remark-gfm@^4.0.1 rehype-slug@^6.0.0 diff@^9.0.0` on Windows. react-markdown 10 peers `react >=18`, so React 19 is fine.
