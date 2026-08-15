# Security review: MFA-bypass fix + dependency vulnerability cleanup
Date: 2026-07-29

## Why
Ran a full multi-agent security review (identify candidate vulns, then
independently re-verify each one against false-positive-filtering
criteria before acting) on the current branch, plus an `npm audit` pass
on both apps, at the user's request ("check my npm packages and
/security-review").

## What changed
- `backend/src/middleware/auth.ts`: `requireAuth` now rejects any bearer
  token carrying a `purpose` claim. The MFA-challenge `tempToken` minted
  by `/api/auth/login` and `/api/auth/google` (`purpose: "mfa_verification"`)
  is signed with the same `JWT_SECRET` as real access tokens and carries a
  valid `userId` — before this fix, `requireAuth` accepted it as a normal
  access token on *any* route (verified by `jwt.verify` + DB lookup only,
  no `purpose` check anywhere in that path), fully defeating MFA for up to
  5 minutes for any MFA-enabled account, including ADMIN. `/api/auth/mfa/verify`
  doesn't go through `requireAuth` (it does its own inline `purpose` check),
  so this fix doesn't affect the real verification flow.
- `backend/package.json` / `package-lock.json`: ran `npm audit fix`
  (non-breaking only). Fixed: `body-parser` (DoS via limit bypass),
  `multer` 2.1.1→2.2.0 (two DoS advisories), `protobufjs` (three DoS
  advisories, via `express`/`google-gax` bumps). Left unresolved:
  `@google-cloud/pubsub`/`@opentelemetry/core` (moderate) and a
  `brace-expansion`→`minimatch`→`glob`→`rimraf`→`google-gax` chain (high)
  — both only fixable via a semver-major `@google-cloud/pubsub@5.0.0`
  (actually a *downgrade* from the currently-resolved 5.3.x) or an
  experimental `google-gax@6`, neither of which I applied without a way
  to test the pubsub integration in this sandbox.
- `frontend/package-lock.json`: didn't exist before (only backend had one
  committed) — generated it via `npm i --package-lock-only` so
  vulnerabilities are trackable, then ran `npm audit fix` (non-breaking),
  which fixed one `tar` DoS advisory (transitive, electron-builder only).
  **Not added to git** — the repo root `.gitignore` has a blanket
  `package-lock.json` rule; `backend/`'s copy is tracked only because it
  predates that rule. Left as an untracked file; didn't force-add it
  since the ignore looks deliberate rather than an oversight — flag to
  user if they want it committed.

## Follow-up (same day): closed the two remaining real gaps
User asked to "fix all security issues" so nothing could cause "fatal
repercussions." Re-triaged the leftovers above by actual reachability
instead of raw audit severity:
- `backend/package.json`: removed `@google-cloud/pubsub` entirely — grepped
  `backend/src` and it has zero imports/references anywhere (dead
  dependency, likely a leftover from the abandoned Google Chat alerts
  attempt, see git log "had to remove gchat implementation"). This fully
  eliminates the `@opentelemetry/core` moderate vuln (only `pubsub`
  declared it) with zero behavior change. `npm uninstall` removed 14
  packages; `tsc --noEmit` still clean.
- `backend/src/services/auditBackup.ts`: fixed the CSV-formula-injection
  gap (`csvEscape`) flagged at confidence 7 in the review — now prefixes
  any value starting with `=`, `+`, `-`, or `@` with a `'` before the
  existing quote/comma/newline escaping, so a formula/DDE payload in a
  self-registered `name`/`email`/`department` can't execute when an admin
  opens the retention-sweep export in Excel/Sheets.
- Investigated the remaining `google-gax`→`rimraf`→`glob`→`minimatch`→
  `brace-expansion` chain (now only via `@google-cloud/secret-manager`,
  which genuinely is used — `services/secretManager.ts`) before deciding
  whether to force a bump: grepped `node_modules/google-gax/build/` for
  any reference to `rimraf` and found **none** — `rimraf` is a declared
  but unused-at-runtime dependency of `google-gax` itself, so this chain
  is never loaded/executed by anything our backend calls. Left
  unforced — a downgrade/major-bump of `secret-manager` (core to this
  app's KMS-adjacent secret handling) to chase an unreachable transitive
  DoS would be the actually risky move here.
- Double-checked the frontend leftovers rather than assuming: fetched the
  live `react-router` advisory (GHSA-qwww-vcr4-c8h2) — confirmed in the
  advisory text it "only affects your application if you are using the
  unstable RSC APIs," and grepped `frontend/src` for any `unstable_`/RSC
  usage — none (plain client-side SPA). Also checked
  `frontend/vite.config.js`: no `host: true`/`0.0.0.0` binding, so the
  esbuild dev-server advisory isn't network-exposed by default either.
  `electron-builder`/`eslint` chains remain dev/build-tooling-only,
  never shipped in the built app or Electron bundle. None of these are
  reachable attack paths in this app as configured, so none were forced.

## Notes / gotchas
- Remaining frontend vulns (23 high, 1 moderate) are almost entirely
  transitive through **electron-builder** and **eslint** (both dev/build
  tooling, not shipped runtime code) plus `vite`/`esbuild` (dev-server
  only) and `react-router-dom` (high, but the specific CVE is scoped to
  RSC mode — this is a client-only React 18 SPA, no RSC in use). All
  require major/breaking bumps (`electron-builder@22` is actually older
  than what's likely installed — check before bumping; `eslint@10`,
  `vite@8`); none applied here.
- Security review methodology: one identification pass, then one
  independent verification sub-task per candidate finding (each re-reads
  the actual code and scores 1-10), keeping only confidence ≥8. Two other
  candidates were surfaced and dropped after verification: an
  under-scoped `/api/directory` endpoint (confidence 3 — the missing role
  check and its most sensitive fields are byte-identical to `main`. i.e.
  pre-existing, not introduced by this branch) and a CSV-formula-injection
  gap in the new `auditBackup.ts` export (confidence 7 — real code-level
  gap, but requires an admin to open the file in a spreadsheet app with
  legacy DDE settings that modern Excel/Sheets block by default; worth a
  follow-up if the user wants defense-in-depth, just under this pass's
  bar).
- Verified with `tsc --noEmit` (clean) and spot-checked that no installed
  package ended up empty/corrupted post-`npm audit fix` (a known risk on
  this repo's vboxsf mount per `CLAUDE.md`) — all fixed packages resolved
  with real, non-empty contents on disk.
- Left many stray `.{pkg}-{randomsuffix}` temp directories inside both
  apps' `node_modules/` from the installs above (same vboxsf rename-race
  as documented in `CLAUDE.md` — cosmetic clutter in a gitignored
  directory, not corruption; didn't fight the filesystem further to clean
  them all up).
