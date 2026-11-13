## Overview {#overview}

The OrkaVault REST API gives security-monitoring applications that PROJXON has authorized **read-only access to the audit log**. It is how a monitoring tool learns about sign-ins, credential reveals, access decisions, administrative changes and other security-relevant events without anyone exporting CSV files by hand.

- **Version:** v1. The version is part of the path, so a future breaking change will get a new path and v1 will keep working until it is retired.
- **Read-only:** there are no write endpoints. Nothing you do through the API can change OrkaVault.
- **Format:** JSON over HTTPS. Every response is sent with `Cache-Control: no-store`.
- **Base URL:** shown in the box at the top of this page. In the examples below it appears as `{{AUDIT_BASE_URL}}`.

## Authentication {#authentication}

Every request needs an API key in the `Authorization` header:

```http
Authorization: Bearer oksec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys start with `oksec_` followed by 43 URL-safe characters. The header is the **only** place a key is accepted. Keys in a query string, a cookie or a request body are ignored and the request fails with 401.

### Getting a key

1. An administrator opens **Settings → Integrations** and chooses **Generate key**.
2. They give the key a name that says which integration uses it, and pick an expiry: **30 days, 90 days, 365 days, or never**.
3. They confirm with a code from their authenticator app. Two-factor authentication must be turned on to create or regenerate a key.
4. The key is shown **once**. Copy it straight into the integration's secret settings. OrkaVault stores only a hash and the last four characters, so a lost key can't be recovered, only replaced.

At most **3 keys** can be active at the same time. Revoke one to create another.

### Keeping a key safe

An API key can read the whole audit log, including names, email addresses and IP addresses. Treat it like a shared admin password:

- Store it only in the approved application's secret store or environment (the examples use `ORKAVAULT_AUDIT_API_KEY`).
- **Never** put it in a URL or query string, browser or other client-side code, a repository, a document, a ticket, a chat message or an email.
- Use one key per integration, so a single key can be revoked without affecting anything else.

## Endpoints {#endpoints}

### List audit entries {#list-audit-entries}

```http
GET {{AUDIT_BASE_URL}}?after=<seq>&limit=<n>&action=<A,B>
```

Returns audit entries in ascending `seq` order, starting after the cursor you pass.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `after` | integer, 0 – 2147483647 | `0` | Return entries whose `seq` is greater than this. Pass the `nextCursor` from your previous response. |
| `limit` | integer, 1 – 1000 | `500` | Maximum number of entries to return. |
| `action` | comma-separated list | all actions | Only return these actions, for example `LOGIN_FAILED,PASSWORD_REVEALED`. Up to 100 names, letters and underscores only. See the [audit action catalog](#audit-actions). |

Each parameter may appear only once. Any other parameter is rejected with 400, so a typo doesn't silently return unfiltered data.

Entries newer than **30 seconds** are held back (see [the settle window](#settle-window)).

**Response `200`:**

```json
{
  "items": [
    {
      "seq": 10452,
      "id": "6f1c2b9e-1d4a-4a0e-9a57-0d3a2f6c9b11",
      "timestamp": "2026-11-13T15:04:05.123Z",
      "action": "PASSWORD_REVEALED",
      "userId": "c3d1e0a2-...",
      "accountId": "9b2f4c11-...",
      "ipAddress": "203.0.113.24",
      "metadata": null,
      "actorEmail": "jane.doe@example.com",
      "accountName": "Shared analytics login",
      "user": {
        "id": "c3d1e0a2-...",
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "department": "Marketing",
        "role": "USER",
        "active": true
      },
      "account": { "id": "9b2f4c11-...", "name": "Shared analytics login" }
    }
  ],
  "nextCursor": 10452,
  "hasMore": false,
  "serverTime": "2026-11-13T15:05:00.000Z"
}
```

| Field | Description |
|---|---|
| `items[].seq` | Monotonic sequence number. Use it as your cursor. |
| `items[].id` | Unique entry id. Use it to deduplicate. |
| `items[].timestamp` | When the action happened (ISO 8601, UTC). |
| `items[].action` | The action name. See the [catalog](#audit-actions). |
| `items[].userId`, `items[].user` | The user who did it. `null` for events with no known user (for example a failed sign-in to an unknown email, or a rejected API request), and for users whose record has since been deleted. |
| `items[].actorEmail` | The user's email address **at the time**. Kept even after the user is deleted. |
| `items[].accountId`, `items[].account`, `items[].accountName` | The shared credential involved, if any. `accountName` is a snapshot kept after the credential is deleted. |
| `items[].ipAddress` | The client IP the request came from, when known. |
| `items[].metadata` | Action-specific details, or `null`. The catalog lists the fields each action can carry. Metadata never contains a secret, password, one-time code, token or API key. |
| `nextCursor` | The `seq` of the last item returned, or your `after` value if nothing was returned. Store it once the batch is processed. |
| `hasMore` | `true` when more entries are ready right now. Call again with `after=nextCursor`. |
| `serverTime` | The server's clock when the response was built. |

Entries written before snapshots were introduced may have `actorEmail` and `accountName` set to `null`.

**curl:**

```bash
curl -sS \
  -H "Authorization: Bearer $ORKAVAULT_AUDIT_API_KEY" \
  "{{AUDIT_BASE_URL}}?after=0&limit=100"
```

**Node.js 18+:**

```js
const BASE_URL = "{{AUDIT_BASE_URL}}";

async function fetchPage(after) {
  const url = `${BASE_URL}?after=${after}&limit=1000`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ORKAVAULT_AUDIT_API_KEY}` },
  });
  if (!res.ok) throw new Error(`OrkaVault audit API: HTTP ${res.status}`);
  return res.json(); // { items, nextCursor, hasMore, serverTime }
}
```

### Status {#status}

```http
GET {{AUDIT_BASE_URL}}/status
```

Returns the range of entries the server still holds, so you can tell whether anything was removed by retention before you read it. Takes no parameters.

**Response `200`:**

```json
{
  "oldestSeq": 9800,
  "newestSeq": 10460,
  "retentionDays": 365,
  "serverTime": "2026-11-13T15:05:00.000Z"
}
```

| Field | Description |
|---|---|
| `oldestSeq`, `newestSeq` | The lowest and highest `seq` still in the live log. Both are `null` if the log is empty. |
| `retentionDays` | How many days entries stay in the live log before they are moved to backup, or `null` if retention isn't configured. |
| `serverTime` | The server's clock. |

**curl:**

```bash
curl -sS \
  -H "Authorization: Bearer $ORKAVAULT_AUDIT_API_KEY" \
  "{{AUDIT_BASE_URL}}/status"
```

**Node.js 18+:**

```js
const res = await fetch("{{AUDIT_BASE_URL}}/status", {
  headers: { Authorization: `Bearer ${process.env.ORKAVAULT_AUDIT_API_KEY}` },
});
const status = await res.json(); // { oldestSeq, newestSeq, retentionDays, serverTime }
```

## Polling guide {#polling}

The API is pull-based. A typical integration runs on a schedule (for example every 5 minutes) and does this:

1. **Load the cursor** from durable storage: a database row or a file that survives restarts, not a variable in memory. Start at `0` the first time.
2. **Check `/status`.** If `oldestSeq > cursor + 1`, entries were removed by retention before you read them. Raise an alert, then carry on from where you are.
3. **Read until caught up.** Call `GET ?after=<cursor>&limit=1000`. Process the items, then **save `nextCursor` only after they are safely stored**. Repeat while `hasMore` is `true`.
4. **Deduplicate by `id`.** Reading is idempotent. If a run crashes after processing but before saving the cursor, the next run re-reads the same entries; dedupe makes that harmless.

```js
let cursor = await loadCursor(); // from durable storage

const status = await getStatus();
if (status.oldestSeq !== null && status.oldestSeq > cursor + 1) {
  alert(`Audit entries ${cursor + 1}–${status.oldestSeq - 1} were removed before they were read`);
}

for (;;) {
  const page = await fetchPage(cursor);
  await storeEntries(page.items); // upsert by id
  cursor = page.nextCursor;
  await saveCursor(cursor);
  if (!page.hasMore) break;
}
```

### The settle window {#settle-window}

Entries younger than **30 seconds** are never returned. An entry gets its `seq` when its database transaction starts writing, but becomes visible only when the transaction commits, so a slow transaction can become visible after a faster one with a higher `seq`. Holding back the newest 30 seconds means your cursor never moves past an entry you haven't seen yet. In practice your data is at most about 30 seconds plus your polling interval behind.

### Gaps in `seq`

`seq` always increases but can skip numbers. The database skips a value whenever a transaction that would have written an audit entry is rolled back. A sudden large run of missing numbers is worth a look, but a gap on its own **is not evidence of tampering**.

## Errors {#errors}

Error responses are JSON with an `error` message, except where noted.

| Status | When | Body |
|---|---|---|
| `400` | A query parameter is unknown, repeated, out of range or malformed. | `{ "error": "limit must be between 1 and 1000." }` (the message says what's wrong) |
| `401` | The key is missing, malformed, unknown, revoked, expired, or lacks the audit-read scope. | Always `{ "error": "Unauthorized." }` |
| `403` | Any method other than `GET` (or `HEAD`). The API is read-only, and non-GET requests are stopped by OrkaVault's CSRF protection before they reach it. | `{ "error": "Invalid or missing CSRF token.", "code": "CSRF_INVALID" }` |
| `404` | Unknown path, **or the API is switched off on this server.** When switched off, every path returns the server's ordinary not-found page, whatever key you send. | varies |
| `405` | A non-GET method that got past CSRF protection. | `{ "error": "Method not allowed." }` |
| `429` | Rate limit reached (see [Rate limits](#rate-limits)). | `{ "error": "Too many requests. Slow down." }` or `{ "error": "Too many failed attempts. Please wait and try again." }` |
| `500` / `503` | A server or database problem. | `{ "error": "..." }` |

**For operators debugging a 401:** the response deliberately doesn't say which check failed. The reason is written to OrkaVault's audit log as an `EXTERNAL_API_AUTH_FAILED` entry with `reason` set to one of `MISSING`, `MALFORMED`, `INVALID`, `REVOKED`, `EXPIRED` or `SCOPE`. An administrator can look it up on the Audit page.

### Retry policy

- **429 and 5xx:** retry with exponential backoff (for example 1 s, 2 s, 4 s … up to a few minutes, with some jitter). On 429, wait at least as long as the `RateLimit` header says.
- **401: don't retry.** The key won't start working on its own. Retrying only adds failed-attempt entries and can trip the failed-attempt limit. Alert a human.
- **400: don't retry.** Fix the request.
- **404:** the API may be switched off. Alert, and retry on your normal schedule rather than in a tight loop.

## Rate limits {#rate-limits}

| Limit | Applies to |
|---|---|
| **120 requests per minute per key** | Every authenticated request. |
| **10 failed authentications per 15 minutes per IP address** | Only requests that end in 401 count. |

Responses carry the standard `RateLimit-Policy` and `RateLimit` headers (IETF draft-8 format), which tell you your remaining quota and when it resets. A well-behaved poller uses a small fraction of the per-key limit.

## Key handling and rotation {#keys}

### Rotating without downtime

1. Generate a **second** key in Settings → Integrations.
2. Put the new key into the integration's secret settings and redeploy it.
3. Check that **Last used** moves to the new key in Settings → Integrations.
4. Revoke the old key.

**Regenerate** also replaces a key, but it revokes the old one **immediately**, so the integration fails until it has the new key. Use it when a key may have leaked, not for routine rotation.

### Expiry

Administrators get a notification **7 days** before a key expires. Rotate it as above before that date. An expired key gets 401 like any other invalid key.

### If a key leaks

1. **Revoke it** in Settings → Integrations straight away. It stops working on the next request; there is no cache.
2. Tell an OrkaVault administrator, even if you have revoked it yourself.
3. Check the audit log for requests made with it: successful use updates the key's **Last used** time, and rejected use appears as `EXTERNAL_API_AUTH_FAILED`.
4. Create a new key for the integration.

## Audit actions {#audit-actions}

Every value the `action` field can take, with its category, a description and the metadata fields it may carry, is listed in the **Audit action catalog** below. The catalog is generated from OrkaVault's code, so it always matches what the server writes. Action names are never renamed; new ones may be added, so treat an unknown action as valid data, not an error.

## Terms {#terms}

Use of the API and of API keys is governed by the [Terms of Use, API keys and integrations](/legal/terms#api). Data read through the API is PROJXON confidential information and is handled as described in the [Privacy notice](/legal/privacy#audit-log).

## Changelog {#changelog}

- **v1 (2026-11-13):** initial release.
