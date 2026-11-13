# Dev Help

Quick reference for running OrkaVault locally. Two independent apps, no
monorepo tooling — run each command from within that app's own directory
(see `CLAUDE.md` / `ARCHITECTURE.md` for the full layout).

## Backend (`backend/`)

```
npm install               # first time only
npm run dev                # starts the API (ts-node src/index.ts), port 5000/5001
npm run prisma:generate    # regenerate Prisma client after a schema change
npm run prisma:db          # prisma db push — sync schema to Postgres
```

**Testing the API with curl:** auth is cookie-only, and every
POST/PUT/PATCH/DELETE needs a CSRF token. Use a cookie jar, fetch the token
first, then send it as a header:

```
curl -c jar -b jar http://localhost:5001/api/auth/csrf          # → {"csrfToken":"…"}
curl -c jar -b jar -H "X-CSRF-Token: <token>" -H "Content-Type: application/json" \
     -d '{"email":"…","password":"…"}' http://localhost:5001/api/auth/login
```

Without the header you get `403 {"code":"CSRF_INVALID"}`. Auth routes are
rate-limited to 30 requests per 15 min per IP (restart the API to reset).

## External audit API (OrkaSecurity, Phase 4c)

A read-only API that OrkaSecurity polls for OrkaVault's audit log:
`GET <API base>/api/external/v1/audit` and `/status`. It accepts only a
service API key (`oksec_…`) in the `Authorization: Bearer` header; user
cookies don't work on it, and the key doesn't work anywhere else. Full
route shapes are in `ARCHITECTURE.md` §2.

### Key lifecycle runbook

There's no script and no key hashes in env. The only env var is the switch.

1. **Enable:** set `EXTERNAL_AUDIT_API_ENABLED=true` on Render and redeploy.
   Until then every path answers a plain 404, and the Integrations tab
   shows a notice.
2. **Create:** Settings → Integrations → **Generate key** (name, expiry,
   current authenticator code) → copy the key → paste it into
   OrkaSecurity's secret env (e.g. `ORKAVAULT_AUDIT_API_KEY`). The key is
   shown once. If it's lost, regenerate.
3. **Zero-downtime rotation:** generate a **second** key → switch
   OrkaSecurity to it → confirm "Last used" moves to the new key (it
   updates at most once a minute) → revoke the old one. ("Regenerate" also
   works, but it kills the old key instantly, so OrkaSecurity fails until
   it's updated.) Max 3 active keys.
4. **Leak:** **Revoke** the key in the UI. It takes effect on the next
   request. If the vault UI itself is in question, set
   `EXTERNAL_AUDIT_API_ENABLED` to anything else and redeploy; the API then
   returns 404 for every key.
5. **Expiry:** admins get a notification 7 days ahead. Rotate as in step 3.

Every create, regenerate and revoke writes an `API_KEY_*` audit row and
notifies all admins. A key survives its creator being deactivated (it's an
org integration); revoke it by hand if that's not wanted.

### Contract for OrkaSecurity (the poller isn't built here)

- Run on a schedule (e.g. every 5 min). Keep `cursor` in durable storage,
  not in function memory.
- Loop `GET /api/external/v1/audit?after=<cursor>&limit=1000` until
  `hasMore` is false. Store `nextCursor` only after the batch is safely
  processed.
- Dedupe by `id`. Pulls are idempotent, so re-reading from an older cursor
  after a retry is safe.
- Rows appear about 30 s after they're written (settle window); that's
  expected.
- Each run, call `/status`. Alert if `oldestSeq > cursor + 1`: rows were
  purged by retention before they were read. Treat a sudden run of
  missing `seq` values as a signal, **not** proof of tampering, because
  Postgres sequences also skip on rolled-back transactions.
- Send the key only in `Authorization: Bearer` over HTTPS, never in a URL.
  Every auth failure is the same `401 {"error":"Unauthorized."}`; 10 failed
  attempts per 15 min per IP → 429. Successful calls are limited to 120 per
  minute per key.
- Query params are strict: anything other than `after`, `limit`,
  `action` (comma list) → 400.

## Frontend (`frontend/`)

```
npm install               # first time only
npm run dev                # Vite dev server, port 3000
npm run electron:dev       # same dev server + Electron desktop shell
```

- **`VITE_GOOGLE_CLIENT_ID` is required** in `frontend/.env` for Google
  sign-in. There's no `"dummy-client-id"` fallback any more: without it, the
  Login/Register pages show a red error in dev (and hide the Google option
  in a production build).
- **No third-party loads before consent.** Inter is self-hosted
  (`src/assets/fonts/`), and Google Identity Services only loads after the
  consent banner's Accept or a click on "Continue with Google". To see the
  banner again, delete the `orka-consent` localStorage key (and the
  `orka-consent-session:*` sessionStorage keys).
- **CSP** lives in `csp.config.js` and is applied by `vite build` only. The
  dev server and `vite preview` send no CSP header. The header comes from the
  host (nginx, `firebase.json`, `vercel.json`), so check it on a deployed
  build, such as a Firebase PR preview channel. Look for `[Report Only]`
  messages in the DevTools console. Reports also go to `POST /api/csp-report` on the backend (logged as
  `[CSP report]`). Desktop builds (`ELECTRON=true`) get an *enforcing*
  `<meta>` CSP. If you change the generic policy, update `firebase.json` /
  `vercel.json` too: the build warns when they drift.

## Postgres via Docker

A minimal `docker-compose.yml` at the repo root spins up just the
database (the two apps still run via `npm run dev` above, not in
containers):

```
docker compose up -d       # starts Postgres, persists to a named volume
docker compose down         # stops it (add -v to also wipe the volume)
```

This brings up `postgres:16` on `localhost:5432` with user/password/db
all set to `orkavault`. Make sure `backend/.env`'s `DATABASE_URL` matches:

```
DATABASE_URL="postgresql://orkavault:orkavault@localhost:5432/orkavault"
```

If you already have Postgres running locally on 5432 (outside Docker),
either stop it first or change the host port mapping in
`docker-compose.yml` (and `DATABASE_URL` to match).

Once the container is up, run `npm run prisma:db` from `backend/` to
push the schema.

## Database GUI

Prisma Studio is the built-in option — from `backend/`:

```
npx prisma studio
```

Opens a browser GUI at `http://localhost:5555` for browsing/editing tables
directly against `DATABASE_URL`. For something heavier (pgAdmin, TablePlus,
etc.), point it at the same connection string from `backend/.env` (not
reproduced here — it's a gitignored secret file, see `CLAUDE.md`).
