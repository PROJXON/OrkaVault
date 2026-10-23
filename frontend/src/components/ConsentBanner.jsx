import React, { useEffect, useRef, useState } from "react";
import {
  setConsent,
  closeConsentSettings,
  isDesktopApp,
  useConsent,
  useConsentSettingsRequested,
} from "../lib/consent";
import LegalLinks from "./LegalLinks";
import ContentMarkdown from "./ContentMarkdown";
import { useContent } from "../lib/content";

// Non-modal bottom bar (NEW-FEAT §2.3): the page behind it stays readable
// and usable, so legal pages can be read before choosing. Shown until a
// choice for the current consent version (the required COOKIES version,
// see consent.js) exists, or when re-opened via openConsentSettings().
// Skipped in the desktop app, where clicking "Continue with Google" is the
// consent action (see GoogleAuthGate). The explanatory text is the
// CONSENT_BANNER content item; the buttons and category labels are UI.
export default function ConsentBanner() {
  const text = useContent("CONSENT_BANNER");
  const consent = useConsent();
  const settingsRequested = useConsentSettingsRequested();
  const [managing, setManaging] = useState(false);
  const [thirdPartyAuth, setThirdPartyAuth] = useState(consent?.thirdPartyAuth ?? false);
  const regionRef = useRef(null);

  const visible = !isDesktopApp() && (consent === null || settingsRequested);

  useEffect(() => {
    if (!visible) return;
    if (settingsRequested) {
      setManaging(true);
      setThirdPartyAuth(consent?.thirdPartyAuth ?? false);
    }
    regionRef.current?.focus();
  }, [visible, settingsRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  // Publish the bar's height as --consent-banner-h so pages using the
  // .consent-safe class (sign-in, registration, legal pages) can pad their
  // bottom and nothing ends up hidden behind the bar.
  useEffect(() => {
    const el = regionRef.current;
    if (!visible || !el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--consent-banner-h", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--consent-banner-h");
    };
  }, [visible]);

  if (!visible) return null;

  const choose = (value) => {
    setConsent({ thirdPartyAuth: value });
    setManaging(false);
  };

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="region"
      aria-label="Cookie and storage preferences"
      className="no-print fixed bottom-0 inset-x-0 z-[1650] border-t border-[var(--border-default)] bg-[var(--bg-surface-raised)] shadow-[var(--shadow-xl)] focus:outline-none"
    >
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-3">
        {text && (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed [&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]">
            <ContentMarkdown variant="inline">{text.body}</ContentMarkdown>
          </div>
        )}

        {managing && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
            <label className="flex items-start gap-3 text-sm opacity-80">
              <input type="checkbox" checked disabled className="mt-1" />
              <span>
                <span className="font-semibold text-[var(--text-primary)]">Strictly necessary</span>
                <span className="block text-[var(--text-tertiary)]">
                  Sign-in session, security token, theme, and remembered-device keys. Always on.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={thirdPartyAuth}
                onChange={(e) => setThirdPartyAuth(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-[var(--text-primary)]">Sign in with Google</span>
                <span className="block text-[var(--text-tertiary)]">
                  Loads Google Identity Services on the sign-in and registration pages only.
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <LegalLinks showCookieSettings={false} className="mr-auto" />
          {managing ? (
            <>
              {settingsRequested && consent !== null && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setManaging(false); closeConsentSettings(); }}>
                  Cancel
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => choose(thirdPartyAuth)}>
                Save choices
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManaging(true)}>
                Manage
              </button>
              {/* Reject is styled the same as Accept: no nudging toward consent. */}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => choose(false)}>
                Reject optional
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => choose(true)}>
                Accept
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
