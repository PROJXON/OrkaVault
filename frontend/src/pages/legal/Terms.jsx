import React from "react";
import { Link } from "react-router-dom";
import LegalLayout, { Tbd } from "./LegalLayout";
import { LEGAL_CONTACT, TERMS } from "../../lib/legalVersions";

// Terms of Use / Acceptable Use Policy (NEW-FEAT §1.4). Internal audience
// only: this is an AUP for PROJXON members, not a public consumer ToS.
const SECTIONS = [
  {
    id: "who-may-use",
    title: "Who may use OrkaVault",
    content: (
      <>
        <p>
          OrkaVault is PROJXON's internal system for governing access to shared credentials. Only current
          PROJXON members whose registration has been approved by an administrator may use it. Access is
          personal: do not share your sign-in, your multi-factor device, or an active session with anyone,
          including other PROJXON members.
        </p>
        <p>
          Using OrkaVault means you agree to these terms and to the <Link to="/legal/privacy">Privacy notice</Link>.
          If a newer version of these terms is published you will be asked to accept it the next time you
          sign in.
        </p>
      </>
    ),
  },
  {
    id: "shared-credentials",
    title: "Shared credentials",
    content: (
      <>
        <p>Credentials in the shared vault belong to PROJXON. When you are granted access to one:</p>
        <ul>
          <li>Use it only for the work purpose you gave in your access request, and only while the grant is active.</li>
          <li>Request the shortest access type that does the job (90-second view, 24 hours, or ongoing).</li>
          <li>
            Do not copy a credential out of OrkaVault into other password managers, documents, chat messages,
            email, tickets, or source code, and do not screenshot or print it.
          </li>
          <li>Do not pass a credential, one-time code, or QR code on to anyone else. They must request their own access.</li>
          <li>Do not try to access a credential you were not granted, or to get around clearance, department, or approval rules.</li>
          <li>Report a credential you think is exposed, or access you should not have, to an administrator straight away.</li>
        </ul>
        <p>
          Managers and administrators who approve requests are responsible for granting only the access a
          request actually needs, and for revoking access that is no longer needed.
        </p>
      </>
    ),
  },
  {
    id: "personal-vault",
    title: "Personal Vault",
    content: (
      <>
        <p className="legal-note">
          The Personal Vault is being rolled out. This section applies once it is available to you.
        </p>
        <p>
          The Personal Vault is a private space for your own credentials. You may store personal and work
          credentials in it, as long as storing them there does not break another PROJXON policy. Shared
          PROJXON credentials belong in the shared vault, not in your Personal Vault.
        </p>
        <p>
          Your Personal Vault is encrypted in your browser with a vault passphrase that only you know, and
          protected by a one-time recovery key shown to you once at setup. You are responsible for keeping
          both safe. <strong>If you lose both your vault passphrase and your recovery key, PROJXON cannot
          recover your Personal Vault data.</strong> No administrator can reset it for you, other than by
          wiping it.
        </p>
      </>
    ),
  },
  {
    id: "monitoring",
    title: "Monitoring and logging",
    content: (
      <>
        <p>
          OrkaVault is a monitored system. Activity is recorded to protect PROJXON's credentials and to
          investigate misuse, consistent with the System Use Notice shown at sign-in. Recorded activity
          includes:
        </p>
        <ul>
          <li>Access requests, approvals, denials, grant changes and revocations, with the reason you gave.</li>
          <li>Each time a shared password, one-time code, or QR code is revealed.</li>
          <li>Changes to shared credentials and administrative changes to user accounts.</li>
          <li>The IP address the action came from and when it happened.</li>
        </ul>
        <p>
          Where PROJXON's Google Workspace monitoring is enabled, administrators can also see Google
          Workspace sign-in events, connected third-party apps, and registered devices for your PROJXON
          Google account. See the <Link to="/legal/privacy#data-we-collect">Privacy notice</Link> for details.
        </p>
        <p>
          The contents of your Personal Vault are never visible to PROJXON. Only the fact that it exists and
          when it changed are known to the server.
        </p>
      </>
    ),
  },
  {
    id: "your-account",
    title: "Your account and sign-in",
    content: (
      <ul>
        <li>Multi-factor authentication is required. Keep your authenticator app and any remembered devices secure.</li>
        <li>Sign out on shared or public computers, and do not choose "Remember this device" on them.</li>
        <li>Tell an administrator straight away if you lose a device or think your account has been compromised.</li>
      </ul>
    ),
  },
  {
    id: "offboarding",
    title: "Leaving PROJXON",
    content: (
      <>
        <p>
          When your engagement with PROJXON ends, or when an administrator deactivates your account, your
          OrkaVault account is deactivated and all of your access grants to shared credentials end. Records
          of past activity are kept as described in the Privacy notice.
        </p>
        <p>
          What happens to Personal Vault data on offboarding (for example, a grace period to export it
          before it is wiped) is <Tbd>offboarding retention period, NEW-FEAT §14.7</Tbd>. Because PROJXON
          cannot read your Personal Vault, exporting anything you want to keep is your responsibility.
        </p>
      </>
    ),
  },
  {
    id: "misuse",
    title: "Consequences of misuse",
    content: (
      <p>
        Breaking these terms can lead to your access being suspended or revoked, the affected credentials
        being rotated, and action under PROJXON's internal policies and your agreement with PROJXON.
        Serious misuse may also be reported to the relevant authorities. <Tbd>disciplinary wording, legal review</Tbd>
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    content: (
      <p>
        PROJXON may update these terms. Each version has a version number and an effective date, shown at
        the top of this page. When a new version requires your agreement, OrkaVault asks you to accept it
        before you can continue.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Questions",
    content: <p>Questions about these terms: {LEGAL_CONTACT}.</p>,
  },
];

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Use"
      summary="The acceptable use policy for OrkaVault: who may use it, how shared and personal credentials may be used, and what is monitored."
      doc={TERMS}
      sections={SECTIONS}
    />
  );
}
