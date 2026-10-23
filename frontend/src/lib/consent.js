import { useSyncExternalStore } from "react";
import { LEGACY_V1_VERSION } from "./contentRegistry";

// Optional-storage / third-party consent (NEW-FEAT §2.3).
// Strictly-necessary storage (auth cookies, CSRF token, theme, MFA device
// keys) needs no consent. The only optional category today is
// `thirdPartyAuth`: loading Google Identity Services, which talks to
// accounts.google.com and may set Google's own cookies.
//
// The consent version is the required COOKIES version (Phase 4b), set by
// ContentProvider: "Publish & re-ask cookie consent" in Settings → Content
// makes every stored choice stale so the banner asks again, while a minor
// fix doesn't. A stored choice with a different version counts as "no
// choice yet". CONSENT_VERSION is the fallback until content loads, and
// the value the seeded v1 maps to, so Phase 4 choices stay valid.
export const CONSENT_VERSION = 1;
const STORAGE_KEY = "orka-consent";
const SESSION_KEY = "orka-consent-session";

const listeners = new Set();
let cached; // undefined = not read yet; null = no valid choice
let settingsRequested = false;
let consentVersion = CONSENT_VERSION;

/** Called by ContentProvider with the required COOKIES version. */
export function setConsentVersion(requiredCookiesVersion) {
  const next =
    !requiredCookiesVersion || requiredCookiesVersion === LEGACY_V1_VERSION ? CONSENT_VERSION : requiredCookiesVersion;
  if (next === consentVersion) return;
  consentVersion = next;
  cached = undefined;
  notify();
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== consentVersion) return null;
    return { version: parsed.version, thirdPartyAuth: parsed.thirdPartyAuth === true, at: parsed.at };
  } catch {
    return null;
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** The stored choice for the current consent version, or null if none. */
export function getConsent() {
  if (cached === undefined) cached = readStored();
  return cached;
}

export function setConsent({ thirdPartyAuth }) {
  const value = { version: consentVersion, thirdPartyAuth: thirdPartyAuth === true, at: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the choice still applies for this page load.
  }
  cached = value;
  settingsRequested = false;
  notify();
}

// "Continue with Google" click = consent for this browser session only
// (sessionStorage, so it survives an in-tab reload but not a new session).
function hasSessionGrant(category) {
  try {
    return sessionStorage.getItem(`${SESSION_KEY}:${category}`) === "1";
  } catch {
    return false;
  }
}

export function grantSessionConsent(category) {
  try {
    sessionStorage.setItem(`${SESSION_KEY}:${category}`, "1");
  } catch {
    // ignore: the caller keeps its own in-memory state too
  }
  notify();
}

export function hasConsent(category) {
  if (category === "necessary") return true;
  if (getConsent()?.[category] === true) return true;
  return hasSessionGrant(category);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Another tab changed the choice.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cached = undefined;
      notify();
    }
  });
}

/** Re-open the banner's settings panel (footer "Cookie settings" link). */
export function openConsentSettings() {
  settingsRequested = true;
  notify();
}

export function closeConsentSettings() {
  settingsRequested = false;
  notify();
}

export function isConsentSettingsRequested() {
  return settingsRequested;
}

/** Desktop (Electron) build: preload exposes window.electron.isDesktop. */
export function isDesktopApp() {
  return typeof window !== "undefined" && window.electron?.isDesktop === true;
}

/** Re-renders when the stored choice changes; returns getConsent(). */
export function useConsent() {
  return useSyncExternalStore(subscribe, getConsent, getConsent);
}

/** Re-renders when the settings panel is requested/closed. */
export function useConsentSettingsRequested() {
  return useSyncExternalStore(subscribe, isConsentSettingsRequested, isConsentSettingsRequested);
}
