import React from "react";
import { Link } from "react-router-dom";
import LegalLayout, { Tbd } from "./LegalLayout";
import { COOKIES, LEGAL_CONTACT } from "../../lib/legalVersions";
import { isDesktopApp, openConsentSettings } from "../../lib/consent";

// Cookie and storage notice (NEW-FEAT §1.6). Lists every cookie and
// browser-storage key the app actually uses. Sources: routes/auth.ts +
// middleware/csrf.ts (cookies), themeContext.jsx, authContext.jsx,
// consent.js, webCryptoMfa.js. Add a row here for any new key.
const STORAGE_ROWS = [
  {
    name: "accessToken",
    where: "Cookie (httpOnly)",
    purpose: "Keeps you signed in. Page scripts cannot read it.",
    lifetime: "8 hours",
    category: "Strictly necessary",
  },
  {
    name: "refreshToken",
    where: "Cookie (httpOnly)",
    purpose: "Renews your sign-in when the access cookie expires, so you aren't signed out mid-task.",
    lifetime: "7 days, or until you sign out",
    category: "Strictly necessary",
  },
  {
    name: "csrfToken",
    where: "Cookie (httpOnly)",
    purpose:
      "Protects against cross-site request forgery. A matching copy is held in the page's memory only, never in browser storage.",
    lifetime: "7 days, or until you sign out",
    category: "Strictly necessary",
  },
  {
    name: "mfaDeviceId",
    where: "localStorage",
    purpose: "Identifies this browser as a device you chose to remember for multi-factor sign-in.",
    lifetime: "Until you remove the device in your profile or clear site data",
    category: "Strictly necessary",
  },
  {
    name: "OrkaVaultMFA",
    where: "IndexedDB database",
    purpose:
      "Holds the private signing key for a remembered MFA device. The key is created as non-exportable, so page scripts can use it to sign but cannot read it out.",
    lifetime: "Until you remove the device or clear site data",
    category: "Strictly necessary",
  },
  {
    name: "orka-consent",
    where: "localStorage",
    purpose: "Remembers your choice in the privacy banner, with its version and the time you made it.",
    lifetime: "Until you change it or clear site data",
    category: "Strictly necessary",
  },
  {
    name: "orka-consent-session:thirdPartyAuth",
    where: "sessionStorage",
    purpose: 'Remembers that you clicked "Continue with Google" for this browser session only.',
    lifetime: "Until the tab or window is closed",
    category: "Strictly necessary",
  },
  {
    name: "viewAsRole",
    where: "sessionStorage",
    purpose: "Admins and managers only: remembers a \"preview as a lower role\" choice while it is active.",
    lifetime: "Until the tab or window is closed",
    category: "Preference",
  },
  {
    name: "orka-theme",
    where: "localStorage",
    purpose: "Remembers light or dark theme.",
    lifetime: "Until you clear site data",
    category: "Preference",
  },
];

function StorageTable() {
  return (
    <div className="legal-table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Stored in</th>
            <th scope="col">Purpose</th>
            <th scope="col">Lifetime</th>
            <th scope="col">Category</th>
          </tr>
        </thead>
        <tbody>
          {STORAGE_ROWS.map((r) => (
            <tr key={r.name}>
              <td><code>{r.name}</code></td>
              <td>{r.where}</td>
              <td>{r.purpose}</td>
              <td>{r.lifetime}</td>
              <td>{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManageChoices() {
  if (isDesktopApp()) {
    return (
      <p>
        In the desktop app there is no banner. Google's sign-in service loads only when you click
        "Continue with Google", and only for that session.
      </p>
    );
  }
  return (
    <>
      <p>You can change your choice at any time:</p>
      <p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={openConsentSettings}>
          Open cookie settings
        </button>
      </p>
      <p>
        Withdrawing consent stops Google's sign-in service loading from then on. To remove cookies Google
        has already set, clear them in your browser settings. You can also clear all OrkaVault storage in
        your browser. That signs you out, and you will have to set up remembered MFA devices again.
      </p>
    </>
  );
}

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          OrkaVault uses a small number of first-party cookies and browser-storage entries to sign you in,
          keep your session secure, and remember a few choices. None of them are used for advertising,
          analytics, or tracking, and OrkaVault loads no analytics or advertising scripts.
        </p>
        <p>
          The only optional item is <strong>Sign in with Google</strong>. Google's sign-in service is not
          loaded until you allow it in the privacy banner or click "Continue with Google".
        </p>
        <p>
          Strictly necessary and preference items are set by OrkaVault itself and either stay on your
          device or are sent only to OrkaVault. They do not need your consent.{" "}
          <Tbd>confirm this classification for the jurisdictions in scope</Tbd>
        </p>
      </>
    ),
  },
  {
    id: "what-we-store",
    title: "What OrkaVault stores",
    content: <StorageTable />,
  },
  {
    id: "google-sign-in",
    title: "Google sign-in (optional)",
    content: (
      <>
        <p>
          If you allow "Sign in with Google", or click "Continue with Google", the sign-in and registration
          pages load Google Identity Services from <code>accounts.google.com</code>. Google may then set or
          read its own cookies, under{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google's Privacy Policy
          </a>
          . OrkaVault does not control those cookies.
        </p>
        <p>
          Google's service is never loaded on any other page, including the vault. If you reject it, you can
          still sign in with your email and password.
        </p>
      </>
    ),
  },
  {
    id: "personal-vault-key",
    title: "Your Personal Vault key is never stored",
    content: (
      <p>
        When the Personal Vault is available, the key that decrypts it exists only in memory while your vault
        is unlocked. It is never written to cookies, localStorage, sessionStorage, IndexedDB, or disk, and it
        is gone when the vault locks, you sign out, or you close the page. The same goes for your vault
        passphrase and recovery key. See the <Link to="/legal/privacy#personal-vault">Privacy notice</Link>.
      </p>
    ),
  },
  {
    id: "manage",
    title: "Managing your choices",
    content: <ManageChoices />,
  },
  {
    id: "contact",
    title: "Contact",
    content: <p>Questions about this notice: {LEGAL_CONTACT}.</p>,
  },
];

export default function Cookies() {
  return (
    <LegalLayout
      title="Cookie and storage notice"
      summary="Every cookie and browser-storage entry OrkaVault uses, what it is for, and how long it lasts."
      doc={COOKIES}
      sections={SECTIONS}
    />
  );
}
