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
