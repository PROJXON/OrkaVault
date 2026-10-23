Every cookie and browser-storage entry OrkaVault uses, what it is for, and how long it lasts.

## Overview {#overview}

OrkaVault uses a small number of first-party cookies and browser-storage entries to sign you in, keep your session secure, and remember a few choices. None of them are used for advertising, analytics, or tracking, and OrkaVault loads no analytics or advertising scripts.

The only optional item is **Sign in with Google**. Google's sign-in service is not loaded until you allow it in the privacy banner or click "Continue with Google".

Strictly necessary and preference items are set by OrkaVault itself and either stay on your device or are sent only to OrkaVault. They do not need your consent. [TBD: confirm this classification for the jurisdictions in scope]

## What OrkaVault stores {#what-we-store}

| Name | Stored in | Purpose | Lifetime | Category |
|---|---|---|---|---|
| `accessToken` | Cookie (httpOnly) | Keeps you signed in. Page scripts cannot read it. | 8 hours | Strictly necessary |
| `refreshToken` | Cookie (httpOnly) | Renews your sign-in when the access cookie expires, so you aren't signed out mid-task. | 7 days, or until you sign out | Strictly necessary |
| `csrfToken` | Cookie (httpOnly) | Protects against cross-site request forgery. A matching copy is held in the page's memory only, never in browser storage. | 7 days, or until you sign out | Strictly necessary |
| `mfaDeviceId` | localStorage | Identifies this browser as a device you chose to remember for multi-factor sign-in. | Until you remove the device in your profile or clear site data | Strictly necessary |
| `OrkaVaultMFA` | IndexedDB database | Holds the private signing key for a remembered MFA device. The key is created as non-exportable, so page scripts can use it to sign but cannot read it out. | Until you remove the device or clear site data | Strictly necessary |
| `orka-consent` | localStorage | Remembers your choice in the privacy banner, with its version and the time you made it. | Until you change it or clear site data | Strictly necessary |
| `orka-consent-session:thirdPartyAuth` | sessionStorage | Remembers that you clicked "Continue with Google" for this browser session only. | Until the tab or window is closed | Strictly necessary |
| `viewAsRole` | sessionStorage | Admins and managers only: remembers a "preview as a lower role" choice while it is active. | Until the tab or window is closed | Preference |
| `orka-theme` | localStorage | Remembers light or dark theme. | Until you clear site data | Preference |

## Google sign-in (optional) {#google-sign-in}

If you allow "Sign in with Google", or click "Continue with Google", the sign-in and registration pages load Google Identity Services from `accounts.google.com`. Google may then set or read its own cookies, under [Google's Privacy Policy](https://policies.google.com/privacy). OrkaVault does not control those cookies.

Google's service is never loaded on any other page, including the vault. If you reject it, you can still sign in with your email and password.

## Your Personal Vault key is never stored {#personal-vault-key}

When the Personal Vault is available, the key that decrypts it exists only in memory while your vault is unlocked. It is never written to cookies, localStorage, sessionStorage, IndexedDB, or disk, and it is gone when the vault locks, you sign out, or you close the page. The same goes for your vault passphrase and recovery key. See the [Privacy notice](/legal/privacy#personal-vault).

## Managing your choices {#manage}

On the web you can change your choice at any time with **Cookie settings**, at the top of this page and at the bottom of every sign-in and policy page.

Withdrawing consent stops Google's sign-in service loading from then on. To remove cookies Google has already set, clear them in your browser settings. You can also clear all OrkaVault storage in your browser. That signs you out, and you will have to set up remembered MFA devices again.

In the desktop app there is no banner. Google's sign-in service loads only when you click "Continue with Google", and only for that session.

## Contact {#contact}

Questions about this notice: [TBD: PROJXON contact address].
