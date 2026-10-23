import React, { useSyncExternalStore } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { grantSessionConsent, hasConsent, subscribe } from "../lib/consent";

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const hasThirdPartyAuth = () => hasConsent("thirdPartyAuth");

// Mounts GoogleOAuthProvider (which injects accounts.google.com/gsi/client)
// only when the user has consented to `thirdPartyAuth`, or after they click
// the first-party "Continue with Google" button below (click = consent for
// this session). Until then nothing from Google is requested (NEW-FEAT §2.2.2).
// Wrap only the Google sign-in UI with this, never a whole page or the app.
export default function GoogleAuthGate({ children }) {
  const allowed = useSyncExternalStore(subscribe, hasThirdPartyAuth, hasThirdPartyAuth);

  if (!clientId) {
    if (import.meta.env.DEV) {
      return (
        <p role="alert" className="text-sm text-[var(--error-text)] text-center">
          Google sign-in is unavailable: VITE_GOOGLE_CLIENT_ID is not set in frontend/.env.
        </p>
      );
    }
    console.error("[GoogleAuthGate] VITE_GOOGLE_CLIENT_ID missing; Google sign-in hidden.");
    return null;
  }

  if (allowed) {
    return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => grantSessionConsent("thirdPartyAuth")}
        className="btn btn-secondary"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </button>
      <p className="text-xs text-[var(--text-tertiary)] text-center max-w-xs">
        Loads Google's sign-in service (accounts.google.com), which may set its own cookies.
      </p>
    </div>
  );
}
