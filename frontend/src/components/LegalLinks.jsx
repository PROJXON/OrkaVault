import React from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { isDesktopApp, openConsentSettings } from "../lib/consent";

// Terms · Privacy · Cookies · Cookie settings (NEW-FEAT §1.3). Used in the
// Login/Register footers, the sidebar, the consent banner and the legal
// pages themselves.
//
// "Cookie settings" re-opens the consent banner. It's hidden in the desktop
// app, which has no banner (clicking "Continue with Google" is the consent
// action there), and inside the banner itself.
// Inline legal link that opens in a new tab on the web, so the page it sits
// on (the registration form, the System Use Notice gate) keeps its state.
// The desktop app denies window.open for app URLs (main.cjs), so there it
// navigates in place and the legal page's back button returns.
export function InlineLegalLink({ to, children }) {
  const newTab = isDesktopApp() ? {} : { target: "_blank", rel: "noopener noreferrer" };
  return (
    <Link to={to} className="text-brand-blue hover:underline" {...newTab}>
      {children}
    </Link>
  );
}

export default function LegalLinks({ className, showCookieSettings = true, onNavigate }) {
  const linkClass = "hover:text-[var(--brand-text)] hover:underline";
  const items = [
    <Link key="terms" to="/legal/terms" className={linkClass} onClick={onNavigate}>Terms</Link>,
    <Link key="privacy" to="/legal/privacy" className={linkClass} onClick={onNavigate}>Privacy</Link>,
    <Link key="cookies" to="/legal/cookies" className={linkClass} onClick={onNavigate}>Cookies</Link>,
  ];
  if (showCookieSettings && !isDesktopApp()) {
    items.push(
      <button key="settings" type="button" className={linkClass} onClick={openConsentSettings}>
        Cookie settings
      </button>,
    );
  }

  return (
    <nav
      aria-label="Legal"
      className={clsx("legal-links flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]", className)}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.key}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {item}
        </React.Fragment>
      ))}
    </nav>
  );
}
