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

## Frontend (`frontend/`)

```
npm install               # first time only
npm run dev                # Vite dev server, port 3000
npm run electron:dev       # same dev server + Electron desktop shell
```

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
