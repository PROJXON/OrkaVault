import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ThemeProvider } from "./lib/themeContext.jsx";

// Google Identity Services is no longer mounted app-wide: GoogleAuthGate
// loads it only around the sign-in buttons, and only after consent.
// ConsentBanner is rendered by App, inside the router.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
