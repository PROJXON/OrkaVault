import React from "react";
import { Link } from "react-router-dom";
import LegalLayout, { Tbd } from "./LegalLayout";
import { LEGAL_CONTACT, PRIVACY } from "../../lib/legalVersions";

// Privacy notice (NEW-FEAT §1.5). Every data point here must match what the
// code actually stores: backend/prisma/schema.prisma + services/. When a
// model field, integration or retention rule changes, update this page and
// bump PRIVACY.version. The Personal Vault and breach-check sections are
// forward-looking until Phases 5–8 ship; Phase 9 finalizes them.
const SECTIONS = [
  {
    id: "who-we-are",
    title: "Who is responsible",
    content: (
      <p>
        OrkaVault is operated by PROJXON for its own members. PROJXON decides what data OrkaVault
        processes and why. This notice covers the OrkaVault web app and desktop app. It does not cover
        the third-party services that shared credentials give access to.
      </p>
    ),
  },
  {
    id: "data-we-collect",
    title: "Data we collect",
    content: (
      <>
        <h3>Your account</h3>
        <ul>
          <li>Name, email address, and department.</li>
          <li>
            If you sign in with Google: your Google account ID and profile photo URL, received from Google
            when you sign in. If you use email and password: a one-way hash of your password, never the
            password itself.
          </li>
          <li>Role (user, manager, admin), clearance level, and whether you may request international access.</li>
          <li>Start date, end date, and status (pending approval, active, deactivated, or revoked).</li>
          <li>Device names associated with your account, and the shared credentials you have marked as favorites.</li>
          <li>Your Discord user ID, if you link Discord to approve or deny requests from chat.</li>
        </ul>

        <h3>Multi-factor authentication</h3>
        <ul>
          <li>Whether MFA is enabled, and your authenticator (TOTP) secret, stored on the server so codes can be checked.</li>
          <li>
            For each remembered device: a name (for example "Chrome on Windows"), its public key, and when
            it was added and last used. The matching private key stays on your device (see the{" "}
            <Link to="/legal/cookies">Cookie notice</Link>).
          </li>
        </ul>

        <h3>Access requests, grants and notifications</h3>
        <ul>
          <li>
            Access requests: which credential, the access type, the reason you give, the device name and
            location you enter, whether international access was requested, the decision, who made it, and
            when.
          </li>
          <li>Access grants: which credential, who granted it, the access type, when it expires, and when you first viewed it.</li>
          <li>In-app notifications sent to you (title, message, type, and whether you have read it).</li>
        </ul>

        <h3>Audit log</h3>
        <p>
          A record of security-relevant actions: access requests and decisions, grant changes, each reveal
          of a shared password, one-time code or QR code, changes to shared credentials, and administrative
          changes to user accounts. Each entry stores who did it, what they did, related details, the IP
          address it came from, and when. Audit entries never contain the secret value itself.
        </p>

        <h3>Google Workspace monitoring</h3>
        <p>
          If PROJXON administrators have enabled it, OrkaVault reads data about PROJXON Google Workspace
          accounts from Google's admin APIs, matched to you by your Workspace email address:
        </p>
        <ul>
          <li>Sign-in events (success, failure, suspicious), with the IP address and approximate region Google reports.</li>
          <li>Third-party apps connected to your Google account, and the permissions (scopes) they hold.</li>
          <li>Devices registered to your account: type, model, OS version, management state, and last sync time.</li>
          <li>The recovery email and phone number an administrator set on your Workspace account in the Google Admin console.</li>
        </ul>

        <h3>Technical data</h3>
        <ul>
          <li>
            Your IP address, used briefly in memory to rate-limit sign-in attempts. It is not stored for
            this purpose.
          </li>
          <li>
            Content Security Policy violation reports your browser may send automatically. These describe
            which page resource was blocked. They are written to server logs.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use it",
    content: (
      <ul>
        <li><strong>Signing you in and keeping your session secure:</strong> account, MFA, and session data.</li>
        <li>
          <strong>Deciding who can see which shared credential:</strong> role, department, clearance,
          international access, requests and grants.
        </li>
        <li>
          <strong>Accountability and investigating misuse:</strong> the audit log and Workspace monitoring.
        </li>
        <li>
          <strong>Telling people what needs their attention:</strong> in-app notifications, email, and
          Discord or Google Chat alerts to approvers.
        </li>
        <li><strong>Offboarding:</strong> start and end dates, used to remind administrators to revoke access.</li>
      </ul>
    ),
  },
  {
    id: "shared-credentials",
    title: "Shared credential secrets",
    content: (
      <p>
        Secret values of shared credentials (passwords, one-time-code seeds) are stored encrypted, in Google
        Cloud Secret Manager where it is configured, otherwise encrypted in OrkaVault's database. They are
        decrypted only on the server, only when someone with an active grant reveals them, and each reveal
        is logged.
      </p>
    ),
  },
  {
    id: "personal-vault",
    title: "Personal Vault data",
    content: (
      <>
        <p className="legal-note">
          The Personal Vault is being rolled out. This section describes how it works once it is available
          to you.
        </p>
        <p>
          Your Personal Vault is encrypted and decrypted in your browser, with a key derived from a vault
          passphrase that never leaves your device. PROJXON stores only encrypted data and cannot read it.
          That includes entry names, usernames, passwords, URLs, notes, and one-time-code seeds. Nobody at
          PROJXON can read them, including administrators and anyone with database or cloud access.
        </p>
        <p>What the server does store:</p>
        <ul>
          <li>The encrypted entries themselves.</li>
          <li>
            Your vault key, encrypted ("wrapped") twice: once under your passphrase and once under your
            recovery key. Neither the passphrase nor the recovery key is ever sent to the server.
          </li>
          <li>The salt and settings used to derive keys from your passphrase.</li>
          <li>How many entries you have, and when each was created and last changed.</li>
        </ul>
        <p>
          Personal Vault health checks (weak, reused or old passwords) run in your browser after you unlock.
          Their results are not sent to the server. Whether administrators can see that you have a Personal
          Vault and how many entries it holds (never their content) is <Tbd>NEW-FEAT §14.6</Tbd>.
        </p>
        <p>
          <strong>If you lose both your passphrase and your recovery key, your Personal Vault data cannot be
          recovered by anyone.</strong>
        </p>
      </>
    ),
  },
  {
    id: "breach-checks",
    title: "Breached-password checks",
    content: (
      <>
        <p className="legal-note">Planned with the Personal Vault Health page. Not active yet.</p>
        <p>
          If you turn on breached-password checks, your browser checks your Personal Vault passwords against
          the Have I Been Pwned "Pwned Passwords" service. Only the first 5 characters of each password's
          SHA-1 hash are sent. The password itself, its full hash, and your identity are never sent, and the
          comparison happens in your browser. This check is off unless you turn it on.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Third parties that receive data",
    content: (
      <ul>
        <li>
          <strong>Google.</strong> Sign in with Google (only if you use it, and only after you allow it: see
          the <Link to="/legal/cookies">Cookie notice</Link>). Google Cloud Secret Manager, which stores
          shared credential secrets. Google Workspace admin APIs, for the monitoring described above. The
          Gmail API, which sends notification emails to your address.
        </li>
        <li>
          <strong>Discord and Google Chat.</strong> If administrators configure alert channels, access
          request alerts are posted there. They include the requester's name, the credential's name, the
          access type, and the reason. Workspace alerts can include an IP address and region. If you link
          Discord, your Discord user ID is used to check that you may approve or deny from Discord.
        </li>
        <li>
          <strong>Have I Been Pwned.</strong> Only if you turn on breached-password checks (see above).
        </li>
        <li>
          <strong>Hosting and infrastructure providers</strong> that run OrkaVault's servers and database
          (see below).
        </li>
      </ul>
    ),
  },
  {
    id: "hosting",
    title: "Where data is hosted",
    content: (
      <p>
        OrkaVault's servers, database, and encrypted secret storage run on cloud infrastructure operated
        for PROJXON. <Tbd>production hosting providers and regions, NEW-FEAT §14.10</Tbd>
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    content: (
      <ul>
        <li>
          <strong>Your account</strong> is deactivated, not deleted, when you leave or are offboarded, so
          that past activity stays accountable. <Tbd>retention period for deactivated accounts</Tbd>
        </li>
        <li>
          <strong>Audit log:</strong> kept indefinitely unless an administrator sets a retention period.
          With a retention period set, older entries are moved into a CSV backup file on the server and
          removed from the database. Only the most recent backup files are kept (10 by default).
        </li>
        <li>
          <strong>Deleting a user record</strong> (an administrative action, not available in the app)
          also deletes that user's MFA devices, access requests, grants, notifications and audit log
          entries. Audit entries already moved to a CSV backup are not affected.
        </li>
        <li>
          <strong>Google Workspace monitoring data</strong> is linked by email address, not by user record.
          Connected apps, devices and recovery details are refreshed on each sync, and entries Google no
          longer reports are removed. Sign-in events are kept as a history.{" "}
          <Tbd>Workspace event retention period</Tbd>
        </li>
        <li>
          <strong>Personal Vault data</strong> is kept until you reset your vault or your user record is
          deleted. Retention after offboarding is <Tbd>NEW-FEAT §14.7</Tbd>.
        </li>
      </ul>
    ),
  },
  {
    id: "security-limitation",
    title: "A limitation you should know about",
    content: (
      <p>
        Your browser runs OrkaVault's code as delivered by PROJXON's servers each time you open it. If those
        servers or the build pipeline were compromised, they could in theory deliver altered code that
        captures your vault passphrase as you type it. That is a limitation of every browser-based encrypted
        vault. PROJXON reduces this risk with protected and reviewed deployments and a strict Content
        Security Policy. The desktop app is a pinned build that changes only when you install an update.
      </p>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices and requests",
    content: (
      <>
        <p>
          You can see your profile, MFA devices, access requests and notifications in the app. To ask for a
          copy of your data, or for its correction or deletion, contact {LEGAL_CONTACT}. Some records, such as
          the audit log, may be kept where PROJXON needs them for security or legal reasons.
        </p>
        <p>
          Your Personal Vault can be exported or wiped by you at any time once it is available. PROJXON cannot
          export it for you, because PROJXON cannot decrypt it.
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "Users outside the United States",
    content: (
      <p>
        Some PROJXON members work from outside the United States. Additional privacy terms that may apply to
        them (for example under the GDPR) are <Tbd>counsel review, NEW-FEAT §14.12</Tbd>.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    content: (
      <p>
        What OrkaVault stores in your browser, and why, is described in the{" "}
        <Link to="/legal/cookies">Cookie and storage notice</Link>.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: <p>Privacy questions and requests: {LEGAL_CONTACT}.</p>,
  },
];

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy notice"
      summary="What OrkaVault stores about you, why, who else receives it, and how long it is kept."
      doc={PRIVACY}
      sections={SECTIONS}
    />
  );
}
