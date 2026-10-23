# Discord approve/deny bypass fix
Date: 2026-10-23

## Why
Found during Phase 4. `resolveActorByDiscordId` (`routes/integrations.ts`)
checked only the linked user's role, never `active`. A MANAGER or ADMIN
who had been deactivated or offboarded (including the end-date cron)
kept their `discordUserId` link. They could keep approving access
requests from the Discord alert buttons, which grants other people access
to shared credentials. The web path was never affected, because
`requireAuth` re-checks `active` on every request.

## What changed
- `routes/integrations.ts`:
  - `resolveActorByDiscordId` now requires `active`, `mfaEnabled`, and current legal acknowledgment (the same gates as `requireAuth`) before the role check.
  - `/orkavault link <code>` refuses if the code's user is no longer active (codes live 10 minutes).
- `routes/users.ts` (decline, `DELETE /:id`, bulk-delete) and the `checkOffboarding` cron in `index.ts` set `discordUserId: null` when they deactivate a user. This is defense in depth: a deactivated account keeps no chat identity. A reactivated user re-links from Profile.
- `services/discordSignature.ts`: rejects interactions whose `X-Signature-Timestamp` is more than 5 minutes off. The signature covers the timestamp, but nothing checked its age, so a captured signed request could be replayed.

## Notes
- Existing deactivated users who are still linked in prod are covered by the `active` check. Optional cleanup in the Supabase SQL editor: `UPDATE "User" SET "discordUserId" = NULL WHERE active = false;`
- Not changed: there's no self-approval block in `approveAccessRequest` (web or Discord). It doesn't escalate anything: a MANAGER can already reveal accounts in their own collections directly, and ADMIN is unrestricted. Worth a separation-of-duties decision later.
- Verified: backend `tsc --noEmit` is clean. Not exercised against live Discord.
