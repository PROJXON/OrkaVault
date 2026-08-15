# OrkaVault 🔐
**The Secure Credential Management OS · PROJXON Internal Platform**

OrkaVault is PROJXON's internal credential vault. It is a web app with an
Electron desktop shell, built so shared account credentials do not get
passed around directly between employees. Instead, someone requests
access to an account, a Manager or Admin approves it, and the password
or authenticator code is only ever revealed within a scoped, expiring
grant. Raw secrets are never stored in plaintext in the database.

---

## 🛡️ Key Features

Access to the vault is controlled by role. Admins, Managers, and regular
Users each see a different slice of the app, and every one of those
boundaries is enforced on the backend, not just hidden in the frontend.

When someone is granted access to a credential, that access can be a
single ninety second view, a temporary twenty four hour window, or an
ongoing grant, and the underlying password or TOTP code is only decrypted
at the moment it is actually revealed. Admins organize credentials into
collections and assign specific Managers to specific collections, so a
Manager only ever sees and acts on the accounts they are responsible for.

Two factor login is built in using TOTP, including support for
remembering a trusted device through a signed WebCrypto challenge.
Authenticator QR codes for shared accounts can be uploaded and revealed
too, kept separate from the rotating six digit code so that reveal is
gated more strictly.

For organizations on Google Workspace, the app can also ingest login and
OAuth grant activity, track connected third party apps, and inventory
devices through the Admin SDK and Cloud Identity APIs, all visible from
the workspace activity page. Access requests can raise a notification in
Discord (and optionally Google Chat), with Discord alerts including
inline approve and deny buttons so a Manager can act without leaving the
chat.

Every request, approval, denial, and reveal is written to an audit log,
and a scheduled job archives old entries into a downloadable CSV backup
once they age past the retention window. A password health score also
runs across the vault, flagging weak or stale credentials and accounts
overdue for rotation.

---

## 🛠️ Tech Stack
| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Electron (desktop shell) |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM |
| **Database** | PostgreSQL |
| **Auth** | JWT (access + refresh), TOTP based MFA |
| **Integrations** | Google Workspace Admin SDK / Cloud Identity, Discord, Google Chat |

---

## 🏗️ Project Structure
```
backend/    Express + TypeScript API, Prisma/PostgreSQL, JWT auth
frontend/   React 18 + Vite + Electron desktop shell
buildlogs/  Notes on why past changes were made
```
These are two independent apps with their own `package.json` and
lockfile. There is no monorepo tooling tying them together, so backend
and frontend commands should be run from inside their own directory.

---

## 🚀 Getting Started (Local Development)

The full local setup, covering both apps and Postgres, is written out in
[`DEVHELP.md`](./DEVHELP.md). It walks through installing dependencies,
running Postgres with the included `docker-compose.yml`, pushing the
Prisma schema, and starting both dev servers.

Each app has its own `.env.example`, in `backend/.env.example` and
`frontend/.env.example`. Copy it to `.env` in that same directory and
fill in real values before running anything. The backend will refuse to
start if `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing. What every
other variable does and how to obtain it is explained further down in
Configuration and Integrations. Most of them are optional and only gate
a specific feature rather than being needed to run the app at all.

### Desktop App quick start

If someone just wants to run the OrkaVault desktop app against the live
production backend, they do not need Postgres or a local backend at all.

```bash
git clone https://github.com/PROJXON/OrkaVault.git
cd OrkaVault/frontend
npm install
```

Create `frontend/.env` with:
```env
VITE_API_URL=PASTE_YOUR_BACKEND_API_URL_HERE
```

Then launch it with:
```bash
npm run electron:dev
```

### Building a desktop installer

From `frontend/`, run:
```bash
npm run build
npm run build:electron
```
The installer is written out to `frontend/dist-desktop/`.

---

## 🔧 Configuration and Integrations

Everything described here is a `backend/.env` or `frontend/.env`
variable, except where it is noted as configured in the app itself. A
few of these, like the chat webhook URLs, are set by an Admin from the
Settings page once the app is already running, not through environment
variables at all.

### What is required just to run the app

At minimum the backend needs a Postgres connection through `DATABASE_URL`
and `DIRECT_URL`, two different long random strings for `JWT_SECRET` and
`JWT_REFRESH_SECRET`, and `FRONTEND_URL` for CORS. The frontend needs
`VITE_API_URL` pointed at that backend, though it can be left blank
locally since it defaults to localhost. Nothing else below is required
for the app to boot and let people log in.

### Google sign in

Signing in with a Google account depends on a single OAuth 2.0 web
application client ID, created in Google Cloud Console under APIs and
Services, then Credentials. The same client ID value goes in two places,
as `GOOGLE_CLIENT_ID` on the backend, which is what verifies the Google
ID token during login, and as `VITE_GOOGLE_CLIENT_ID` on the frontend,
which is what actually renders the Google button.

### Creating the Google service account

A handful of features, secret storage in GCP, Workspace monitoring, and
Gmail sending, are all backed by the same kind of thing underneath, a
GCP service account with a downloaded key file. It is fine to reuse one
service account across all of them.

Start in Google Cloud Console. If there is no project yet, create one,
then enable whichever APIs the features being used actually need. Secret
storage needs the Secret Manager API. Workspace monitoring needs the
Admin SDK API and the Cloud Identity API. Email needs the Gmail API.

From there, go to IAM and Admin, then Service Accounts, and create one.
Any name works, something like orkavault backend is fine. If Secret
Manager is going to be used, grant this service account the Secret
Manager Admin role on the project, or a tighter pairing of Accessor and
Version Manager if preferred.

Once the service account exists, open its Keys tab, choose Add Key, and
create a new JSON key. This downloads the actual key file, and this file
is the secret that the rest of this configuration refers to. It should
never be committed. Move it into the backend directory as
`local_workspace_sa_key.json`. There is already a
`local_workspace_sa_key.json.example` placeholder sitting there today,
meant to be replaced by this real file, and both `.gitignore` files
already exclude the real filename from being committed. Point
`GOOGLE_WORKSPACE_SA_KEY_PATH` and `GOOGLE_APPLICATION_CREDENTIALS` at
wherever this file actually lives, which can be that same path for both.

If Workspace monitoring or Gmail sending are going to be used, this same
service account also needs domain wide delegation, which is authorized
from the Workspace side rather than the GCP side. That step is covered
in the next two sections.

### Secret storage for vault passwords

Passwords are never stored in Postgres as plaintext. There are two ways
this can work. With `NODE_ENV` set to production, along with
`GOOGLE_APPLICATION_CREDENTIALS` pointed at the service account key file
and `GCP_PROJECT_ID` set, passwords are stored properly in Google Cloud
Secret Manager. Without that fully configured, including in local
development, the app falls back to encrypting the password with AES-256
and storing the ciphertext in Postgres instead. `SECRET_ENCRYPTION_KEY`
is the key used for that fallback path, and it should be set to a real
random string in any real deployment rather than left to its built in
default.

### Google Workspace monitoring

This is what powers login and OAuth grant activity ingestion, connected
app tracking, and device inventory, all visible under workspace activity
for an Admin. It uses the same service account described above, but
needs one more authorization step, because impersonating a Workspace
user requires domain wide delegation, which only Google Workspace itself
can grant.

The first thing needed is the service account's numeric client ID, found
in GCP Console under IAM and Admin, then Service Accounts, on that
account's Details tab. This is not the same thing as its email address.

Then, in the Google Workspace Admin Console, under Security, then API
Controls, then Domain-wide Delegation, add a new entry using that client
ID, and authorize these scopes together as one entry:

```
https://www.googleapis.com/auth/admin.reports.audit.readonly,
https://www.googleapis.com/auth/admin.directory.user.security,
https://www.googleapis.com/auth/admin.directory.user.readonly,
https://www.googleapis.com/auth/cloud-identity.devices
```

Finally, set `GOOGLE_WORKSPACE_ADMIN_EMAIL` to a super admin account for
the service account to impersonate, and `GOOGLE_WORKSPACE_SA_KEY_PATH` to
the key file from earlier. Leaving both unset simply turns this feature
off with no effect on anything else.

### Chat alerts for access requests

Outbound alerts for Discord and Google Chat are set up inside the app
itself, from the Settings page as an Admin, by pasting in each
platform's incoming webhook URL. That alone is enough to get a
notification for every access request, approval, and denial.

Getting the inline approve and deny buttons working in Discord, meaning
someone can actually click a button in Discord rather than just read the
notification, takes a bit more. On the bot's application page in the
Discord Developer Portal, the bot token comes from the Bot tab, and the
public key and application ID both come from the General Information
tab. Those become `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and
`DISCORD_APPLICATION_ID`. That same application also needs its
Interactions Endpoint URL set to the backend's own URL followed by
`/api/integrations/discord/interactions`. On the OrkaVault side, a
Manager or Admin links their Discord account once from their Profile
page, which hands them a one time code to run in Discord as
`/orkavault link <code>`.

Google Chat currently only supports that outbound webhook. There is no
inbound approve or deny wired up for it yet.

### Email notifications

Email is sent through the Gmail API, using the same service account as
`GOOGLE_APPLICATION_CREDENTIALS` above. Like Workspace monitoring, this
needs its own separate domain wide delegation entry authorizing the
`https://www.googleapis.com/auth/gmail.send` scope for that service
account's client ID. It only actually sends mail when `NODE_ENV` is
production and `GOOGLE_APPLICATION_CREDENTIALS` is set. Otherwise the
notification is simply logged to the console instead, so nothing breaks
either way. `GMAIL_SENDER` sets the from address, and defaults to
noreply@projxon.com if left unset.

### Other settings configured in the app

A few remaining things are Admin only settings inside the app rather
than environment variables at all. These include the Workspace login
allow list, made up of `WORKSPACE_ALLOWED_IPS` and
`WORKSPACE_ALLOWED_COUNTRIES`, a toggle for requiring a TOTP QR code on
new Google Workspace accounts, and the audit log retention period.

### Session cache

`REDIS_URL` defaults to `redis://localhost:6379` if it is never set.

---

## ☁️ Deployment

The backend and frontend deploy independently of each other, and each
has its own build command written down in the repo rather than typed
from memory into a hosting dashboard.

The backend's command lives in `backend/build_command.txt`.
```
npm ci && npx prisma generate && npx prisma db push && npm run build
```
After that build, it is started with `npm start`, which runs
`node dist/index.js`. It is meant to run as a standard Node web service,
something like Render, with `DATABASE_URL` pointed at a real Postgres
instance.

The frontend's command lives in `frontend/build_command.txt`.
```
npm ci && npm run build
```
This is meant to be deployed as a static site, something like Vercel,
serving whatever ends up in `frontend/dist/`. The Electron desktop build
is a separate process, covered earlier under building a desktop
installer, and is not part of this web deploy at all.

Both of these use `npm ci` instead of `npm install` on purpose. It
installs exactly what is pinned in the committed `package-lock.json`, so
every deploy is reproducible, and it fails loudly if the lockfile and
`package.json` ever drift out of sync, rather than quietly resolving to
whatever happens to be newest at build time.

Keeping dependencies patched is treated as separate from the build
itself. Dependabot watches both apps and opens a pull request when a fix
becomes available. Reviewing and merging that PR is the only manual step
involved, since the next deploy picks up the change automatically
through the same build command described above.

---

## 🤝 Contributing
1. Create a feature branch: `git checkout -b your-name/feature`
2. Make your changes and commit: `git commit -m "feat: amazing update"`
3. Push and open a Pull Request!

---
© 2026 Projxon OrkaVault. All rights reserved.
