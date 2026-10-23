# CLAUDE.md

Project context for working in OrkaVault. Read `ARCHITECTURE.md` first for
file/route/model navigation — don't re-derive it by exploring the tree.
This file is conventions and behavior; `ARCHITECTURE.md` is the map.

## What this is

OrkaVault: internal credential-vault web app + Electron desktop shell for
PROJXON. Users request time-limited access to shared credentials
("Accounts"); Managers/Admins approve. Raw secrets are never stored in
Postgres — see `ARCHITECTURE.md` §2 (services) and §4 (data model). This
is security-sensitive software; treat it accordingly (below).

## Navigating without the explore tool

- `ARCHITECTURE.md` has the directory layout, the full route table (method
  + path + file), the Prisma model summary, and a "where to make common
  changes" section. Check it before grepping/globbing for a route,
  component, or model.
- If you change a route, page, model, or service in a way that makes
  `ARCHITECTURE.md` wrong (new/renamed/removed route, model field, page,
  or service), update the relevant table/section in the same change.
  Don't let it drift.
- Route files are one-per-resource under `backend/src/routes/`; pages are
  one-per-route under `frontend/src/pages/`. If you know the resource or
  URL path, you know the filename — no search needed.

## Repo layout quick reference

```
backend/    Express + TS API, Prisma/PostgreSQL, JWT auth   (npm run dev, port 5000/5001)
frontend/   React 18 + Vite + Electron desktop shell        (npm run dev; npm run electron:dev)
buildlogs/  Per-task change logs — see BUILDLOG.md for the convention
```

Two independent apps, two `package.json`/lockfiles, no monorepo tooling.
Run backend and frontend commands from within their own directory.

## Conventions

- Backend: TypeScript, Express, Prisma. Routes stay thin; business logic
  (secret handling, health scoring, notifications, redis) lives in
  `backend/src/services/`.
- Frontend: JSX (not TSX) function components, Tailwind for styling,
  axios via `frontend/src/lib/api.js` (handles JWT attach + refresh —
  don't hand-roll fetch/auth headers elsewhere).
- Auth/authorization is enforced **server-side** (`requireAuth` /
  `requireRole` in `backend/src/middleware/auth.ts`). Frontend
  `<ProtectedRoute>` role checks in `App.jsx` are UX only — never treat
  them as the security boundary, and never remove a server-side check
  because "the frontend already hides it."
- No test suite and no lint config currently exist in this repo — don't
  assume a `test` or `lint` npm script; check `package.json` in the
  relevant app before claiming one runs. If you add meaningful backend
  logic, prefer a quick manual verification (curl / ts-node script) over
  inventing a test framework unasked. See "Verifying changes efficiently"
  below before reaching for a runtime script, though — often you don't
  need one.
- `backend/local_master.key`, `backend/.dev-secret-store.json`, and any
  `.env` files are local secrets — gitignored, never read their contents
  into a commit, a buildlog, or output shown back verbatim unless the
  user explicitly asks you to inspect one.

## Filesystem note (this environment)

The project lives on a VirtualBox shared folder (`vboxsf`), which doesn't
support atomic rename reliably. This shows up in a few places:

- The `Write` tool (writes via temp file + rename) reliably fails here
  with `ETXTBSY`. **Use `Bash` with a heredoc (`cat > path << 'EOF' ...
  EOF`) to create or overwrite files instead.** Don't retry `Write` on
  this filesystem — it fails the same way every time.
- `Edit` (in-place, no rename) works *most* of the time but has been
  observed to occasionally hit the same `ETXTBSY` on this mount,
  especially on files edited repeatedly in one session. If `Edit` fails
  this way, just retry it once or twice — it usually goes through. If it
  keeps failing, fall back to the same pattern as bulk find-replace
  below: transform the content with `perl -0777 -pe 's{...}{...}'` (or
  `sed`) redirected to a temp file, then `cat tmpfile > realfile; rm
  tmpfile` — this overwrites the existing inode in place with no rename,
  so it isn't subject to this failure mode at all.
- **`npm install` (any package, either app) can corrupt unrelated,
  already-installed packages mid-install** — same root cause (a rename
  from npm's temp staging dir to the final package dir loses the race).
  Symptoms: a previously-working package suddenly has an empty directory,
  or throws `Cannot find module './something'` for a file that should be
  there. This has hit `ts-node`, `typescript`, and a nested `mime` dep
  transitively required by `jimp`, on completely unrelated install runs.
  - Add `--no-bin-links` to `npm install` in this repo — without it, npm
    tries to symlink CLI bin scripts into `node_modules/.bin` and that
    symlink step fails outright (`EPERM`) on this mount, aborting the
    whole install before anything is written.
  - **Don't repair corruption with `rm -rf node_modules && npm install`**
    — a full reinstall touches hundreds of files and is *more* likely to
    introduce a new corrupted package than fix the one you found, and
    you can spend a long time chasing a moving target this way.
  - Instead, fix just the broken package: `npm pack <pkg>@<version>` (a
    plain download, no install-time rename involved), then extract it
    directly into place: `rm -rf node_modules/<pkg> && mkdir -p
    node_modules/<pkg> && tar -xzf <pkg>-<version>.tgz -C
    node_modules/<pkg> --strip-components=1`. This has reliably fixed
    every corruption seen so far.
  - This is a sandbox/environment quirk, not a project issue — likely
    fine on a normal filesystem. Don't "fix" it by changing project
    config (e.g. don't add `--no-bin-links` to a committed `.npmrc`)
    unless the user says they hit this outside this sandbox too.

## Verifying changes efficiently

This sandbox has no local Postgres/Redis running, so the backend can start
but every DB-backed request will fail — don't repeatedly try to spin it up
expecting a working DB. Whether a browser tool is available varies by
session (it depends on whether the user has the Claude in Chrome extension
connected) — check once at the start of a task that would benefit from
it, and if it's not available, say so once and move on rather than
re-checking on every subsequent step.

When real end-to-end verification genuinely isn't possible, say once,
plainly, what you checked instead and why — don't re-litigate it every
reply, and don't spin up servers/processes speculatively "just in case"
after you've already established they won't get you real signal.

Given that ceiling, match the verification effort to what's actually in
doubt, cheapest first:

- **Backend TypeScript**: `node node_modules/typescript/bin/tsc --noEmit
  -p tsconfig.json` (from `backend/`) type-checks the whole project in a
  few seconds, doesn't execute anything, and — unlike `ts-node` — isn't
  vulnerable to the npm corruption above. Reach for this first; it alone
  order-of-magnitude reduces round trips versus running a script.
- **Frontend JS/JSX**: start the Vite dev server *once* per task (not
  once per file), then `curl` each changed file's path through it
  (`http://127.0.0.1:<port>/src/...`) — a non-200 means a real syntax
  error. Batch all the files you touched into one round of checks at the
  end rather than re-verifying after every single edit. Kill the dev
  server when you're done rather than leaving it running.
- **New third-party library usage** (a new npm package, an unfamiliar
  API): reading the package's shipped `.d.ts`/README is usually enough
  to write correct code, especially for mainstream, well-documented
  libraries. Only write a standalone runtime smoke test when there's
  genuine algorithmic uncertainty you can't resolve by reading (e.g. "do
  these two libraries actually round-trip the same data"), and keep that
  test to the minimum packages needed to answer that one question —
  don't pull in extra packages (e.g. ones only useful for *generating*
  fixture data) just to make the test more thorough than the actual
  question requires.
- If you do need a one-off runtime script, put it in `backend/src/scripts/`
  (see the scripts convention in `ARCHITECTURE.md` §2) and **delete it
  once it's answered your question** — don't leave smoke-test files
  behind.

## Buildlogs

See `BUILDLOG.md` for the full convention. Short version: after finishing
a meaningfully-sized task (feature, non-trivial bugfix, schema change),
write `buildlogs/YYYY-MM-DD-short-slug.md` summarizing why + what changed.
Skip it for trivial edits. Don't ask permission each time — just follow
the convention in `BUILDLOG.md`.

## Token-efficiency habits for this repo

- Prefer `ARCHITECTURE.md`'s route/model tables over opening
  `backend/src/index.ts` or `prisma/schema.prisma` to answer "does X
  route/field exist" questions.
- `backend/src/routes/accounts.ts` (685 lines) and
  `frontend/src/pages/Directory.jsx` (564 lines) are the largest files in
  the repo — read them with a targeted line range (grep for the function
  first) rather than reading top to bottom when you only need one handler.
- Don't run `git log`/full history exploration for context that
  `buildlogs/` already captures — check there first for the "why" behind
  a past change.
