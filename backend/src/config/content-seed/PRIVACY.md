What OrkaVault stores about you, why, who else receives it, and how long it is kept.

## Who is responsible {#who-we-are}

OrkaVault is operated by PROJXON for its own members. PROJXON decides what data OrkaVault processes and why. This notice covers the OrkaVault web app and desktop app. It does not cover the third-party services that shared credentials give access to.

## Data we collect {#data-we-collect}

### Your account

- Name, email address, and department.
- If you sign in with Google: your Google account ID and profile photo URL, received from Google when you sign in. If you use email and password: a one-way hash of your password, never the password itself.
- Role (user, manager, admin), clearance level, and whether you may request international access.
- Start date, end date, and status (pending approval, active, deactivated, or revoked).
- Device names associated with your account, and the shared credentials you have marked as favorites.
- Your Discord user ID, if you link Discord to approve or deny requests from chat.

### Multi-factor authentication

- Whether MFA is enabled, and your authenticator (TOTP) secret, stored on the server so codes can be checked.
- For each remembered device: a name (for example "Chrome on Windows"), its public key, and when it was added and last used. The matching private key stays on your device (see the [Cookie notice](/legal/cookies)).

### Access requests, grants and notifications

- Access requests: which credential, the access type, the reason you give, the device name and location you enter, whether international access was requested, the decision, who made it, and when.
- Access grants: which credential, who granted it, the access type, when it expires, and when you first viewed it.
- In-app notifications sent to you (title, message, type, and whether you have read it).

### Policy acceptances

- Each version of the Terms of Use, this Privacy notice and the System Use Notice you accepted, when, the IP address it came from, and whether it was at registration or after an update. You can see these on your Profile under "My agreements".

### Audit log

A record of security-relevant actions: access requests and decisions, grant changes, each reveal of a shared password, one-time code or QR code, changes to shared credentials, and administrative changes to user accounts. Each entry stores who did it, what they did, related details, the IP address it came from, and when. Audit entries never contain the secret value itself.

### Google Workspace monitoring

If PROJXON administrators have enabled it, OrkaVault reads data about PROJXON Google Workspace accounts from Google's admin APIs, matched to you by your Workspace email address:

- Sign-in events (success, failure, suspicious), with the IP address and approximate region Google reports.
- Third-party apps connected to your Google account, and the permissions (scopes) they hold.
- Devices registered to your account: type, model, OS version, management state, and last sync time.
- The recovery email and phone number an administrator set on your Workspace account in the Google Admin console.

### Technical data

- Your IP address, used briefly in memory to rate-limit sign-in attempts. It is not stored for this purpose.
- Content Security Policy violation reports your browser may send automatically. These describe which page resource was blocked. They are written to server logs.

## How we use it {#how-we-use}

- **Signing you in and keeping your session secure:** account, MFA, and session data.
- **Deciding who can see which shared credential:** role, department, clearance, international access, requests and grants.
- **Accountability and investigating misuse:** the audit log and Workspace monitoring.
- **Telling people what needs their attention:** in-app notifications, email, and Discord or Google Chat alerts to approvers.
- **Offboarding:** start and end dates, used to remind administrators to revoke access.

## Shared credential secrets {#shared-credentials}

Secret values of shared credentials (passwords, one-time-code seeds) are stored encrypted, in Google Cloud Secret Manager where it is configured, otherwise encrypted in OrkaVault's database. They are decrypted only on the server, only when someone with an active grant reveals them, and each reveal is logged.

## Personal Vault data {#personal-vault}

> The Personal Vault is being rolled out. This section describes how it works once it is available to you.

Your Personal Vault is encrypted and decrypted in your browser, with a key derived from a vault passphrase that never leaves your device. PROJXON stores only encrypted data and cannot read it. That includes entry names, usernames, passwords, URLs, notes, and one-time-code seeds. Nobody at PROJXON can read them, including administrators and anyone with database or cloud access.

What the server does store:

- The encrypted entries themselves.
- Your vault key, encrypted ("wrapped") twice: once under your passphrase and once under your recovery key. Neither the passphrase nor the recovery key is ever sent to the server.
- The salt and settings used to derive keys from your passphrase.
- How many entries you have, and when each was created and last changed.

Personal Vault health checks (weak, reused or old passwords) run in your browser after you unlock. Their results are not sent to the server. Whether administrators can see that you have a Personal Vault and how many entries it holds (never their content) is [TBD: NEW-FEAT §14.6].

**If you lose both your passphrase and your recovery key, your Personal Vault data cannot be recovered by anyone.**

## Breached-password checks {#breach-checks}

> Planned with the Personal Vault Health page. Not active yet.

If you turn on breached-password checks, your browser checks your Personal Vault passwords against the Have I Been Pwned "Pwned Passwords" service. Only the first 5 characters of each password's SHA-1 hash are sent. The password itself, its full hash, and your identity are never sent, and the comparison happens in your browser. This check is off unless you turn it on.

## Third parties that receive data {#third-parties}

- **Google.** Sign in with Google (only if you use it, and only after you allow it: see the [Cookie notice](/legal/cookies)). Google Cloud Secret Manager, which stores shared credential secrets. Google Workspace admin APIs, for the monitoring described above. The Gmail API, which sends notification emails to your address.
- **Discord and Google Chat.** If administrators configure alert channels, access request alerts are posted there. They include the requester's name, the credential's name, the access type, and the reason. Workspace alerts can include an IP address and region. If you link Discord, your Discord user ID is used to check that you may approve or deny from Discord.
- **Have I Been Pwned.** Only if you turn on breached-password checks (see above).
- **Hosting and infrastructure providers** that run OrkaVault's servers and database (see below).

## Where data is hosted {#hosting}

OrkaVault's servers, database, and encrypted secret storage run on cloud infrastructure operated for PROJXON. [TBD: production hosting providers and regions, NEW-FEAT §14.10]

## How long we keep it {#retention}

- **Your account** is deactivated, not deleted, when you leave or are offboarded, so that past activity stays accountable. [TBD: retention period for deactivated accounts]
- **Audit log:** kept indefinitely unless an administrator sets a retention period. With a retention period set, older entries are moved into a CSV backup file on the server and removed from the database. Only the most recent backup files are kept (10 by default).
- **Policy acceptances** are kept for as long as your user record exists, so PROJXON can show which version of each policy you agreed to.
- **Deleting a user record** (an administrative action, not available in the app) also deletes that user's MFA devices, access requests, grants, notifications, policy acceptances and audit log entries. Audit entries already moved to a CSV backup are not affected.
- **Google Workspace monitoring data** is linked by email address, not by user record. Connected apps, devices and recovery details are refreshed on each sync, and entries Google no longer reports are removed. Sign-in events are kept as a history. [TBD: Workspace event retention period]
- **Personal Vault data** is kept until you reset your vault or your user record is deleted. Retention after offboarding is [TBD: NEW-FEAT §14.7].

## A limitation you should know about {#security-limitation}

Your browser runs OrkaVault's code as delivered by PROJXON's servers each time you open it. If those servers or the build pipeline were compromised, they could in theory deliver altered code that captures your vault passphrase as you type it. That is a limitation of every browser-based encrypted vault. PROJXON reduces this risk with protected and reviewed deployments and a strict Content Security Policy. The desktop app is a pinned build that changes only when you install an update.

## Your choices and requests {#your-choices}

You can see your profile, MFA devices, access requests, notifications and the policy versions you accepted in the app. To ask for a copy of your data, or for its correction or deletion, contact [TBD: PROJXON contact address]. Some records, such as the audit log, may be kept where PROJXON needs them for security or legal reasons.

Your Personal Vault can be exported or wiped by you at any time once it is available. PROJXON cannot export it for you, because PROJXON cannot decrypt it.

## Users outside the United States {#international}

Some PROJXON members work from outside the United States. Additional privacy terms that may apply to them (for example under the GDPR) are [TBD: counsel review, NEW-FEAT §14.12].

## Cookies and local storage {#cookies}

What OrkaVault stores in your browser, and why, is described in the [Cookie and storage notice](/legal/cookies).

## Contact {#contact}

Privacy questions and requests: [TBD: PROJXON contact address].
