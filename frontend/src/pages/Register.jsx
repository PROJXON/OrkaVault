import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { GoogleLogin } from "@react-oauth/google";
import GoogleAuthGate from "../components/GoogleAuthGate";
import LegalLinks from "../components/LegalLinks";
import SystemUseBanner from "../components/SystemUseBanner";
import ContentMarkdown from "../components/ContentMarkdown";
import { useContent, useContentState } from "../lib/content";
import { Eye, EyeOff } from "lucide-react";
import logo from "../assets/OrkaVault.png";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState([]);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { register, continueWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [googleId, setGoogleId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  // NEW-FEAT §4.3: required, unchecked by default. Gates both the form
  // submit and the Google button; the backend rejects a missing version too.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // The checkbox accepts the current TERMS and PRIVACY versions; the backend
  // rejects anything else (Phase 4b).
  const termsLabel = useContent("REGISTER_TERMS_LABEL");
  const terms = useContent("TERMS");
  const privacy = useContent("PRIVACY");
  const { refreshContent } = useContentState();

  useEffect(() => {
    api.get("/auth/setup-status").then((res) => {
      setIsFirstUser(res.data.isFirstUser);
    }).catch(() => {});
    api.get("/departments").then((res) => {
      setDepartments(res.data);
      if (res.data.length > 0) setDepartment((d) => d || res.data[0].name);
    }).catch(() => {});
  }, []);

  const generateSecurePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  useEffect(() => {
    if (location.state?.googleData) {
      const { name, email, avatarUrl, googleId } = location.state.googleData;
      setName(name || "");
      setEmail(email || "");
      setAvatarUrl(avatarUrl || "");
      setGoogleId(googleId || "");
      setPassword(generateSecurePassword());
      setSuccess("Google details loaded. A secure random password has been generated for you. You can change it now or keep it.");
      setShowPassword(true); // Show the generated password
      // remove state to avoid re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!acceptedTerms) {
      setError("You must accept the Terms of Use and Privacy notice to register.");
      return;
    }
    try {
      const res = await api.post("/auth/register", {
        name,
        email,
        password,
        department,
        startDate,
        googleId,
        avatarUrl,
        setupToken: isFirstUser ? setupToken : undefined,
        acceptedVersions: { TERMS: terms?.version, PRIVACY: privacy?.version },
      });
      if (res.data.active) {
        setSuccess(
          "Admin account created successfully. Redirecting to login...",
        );
      } else {
        setSuccess(
          "Registration successful. Your account is pending admin approval. Redirecting to login...",
        );
      }
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      // The Terms or Privacy notice was re-published while this page was
      // open: load the new versions and ask the user to re-confirm.
      if (err.response?.data?.currentVersions) {
        await refreshContent();
        setAcceptedTerms(false);
        setError("The Terms of Use or Privacy notice was just updated. Review it, tick the box again and register.");
        return;
      }
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError("");
    try {
      const res = await continueWithGoogle(credentialResponse.credential);
      if (res.action === "login") {
        navigate("/"); // Already registered, logged them in
      } else if (res.action === "register") {
        const { name, email, avatarUrl, googleId } = res.data;
        setName(name || "");
        setEmail(email || "");
        setAvatarUrl(avatarUrl || "");
        setGoogleId(googleId || "");
        setPassword(generateSecurePassword());
        setSuccess("Google details loaded. A secure random password has been generated for you. You can change it now or keep it.");
        setShowPassword(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Google auth failed");
    }
  };

  return (
    <div className="consent-safe min-h-screen bg-gray-50 dark:bg-[var(--bg-canvas)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center mb-4">
          <img
            src={logo}
            alt="OrkaVault"
            className="h-20 w-auto object-contain"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-[var(--text-primary)]">
          Create a new account
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-[var(--bg-surface)] py-8 px-4 shadow-sm sm:rounded-lg sm:px-10">
          <SystemUseBanner />
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border-l-4 border-brand-red p-4">
                <p className="text-sm text-brand-red">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border-l-4 border-brand-green p-4">
                <p className="text-sm text-brand-green">{success}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-xs placeholder-gray-400 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                Email address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-xs placeholder-gray-400 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-xs placeholder-gray-400 focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-[var(--text-tertiary)] hover:text-gray-600 dark:text-[var(--text-secondary)]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                Department
              </label>
              <div className="mt-1">
                <select
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-xs focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {isFirstUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Admin Setup Token
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Enter the secret token from the server"
                    className="appearance-none block w-full px-3 py-2 border border-brand-blue rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                </div>
              </div>
            )}

            {!isFirstUser && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                  Start Date
                </label>
                <div className="mt-1">
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-xs focus:outline-hidden focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex items-start">
              <input
                id="accept-terms"
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded-sm"
              />
              <label htmlFor="accept-terms" className="ml-2 block text-sm text-gray-700 dark:text-[var(--text-secondary)]">
                {termsLabel && <ContentMarkdown variant="inline">{termsLabel.body}</ContentMarkdown>}
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={!acceptedTerms}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-brand-blue hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Register
              </button>
            </div>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-[var(--border-default)]" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-[var(--bg-surface)] text-gray-500 dark:text-[var(--text-tertiary)]">
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                {/* GoogleLogin has no disabled prop, so it isn't mounted
                    (no button, no One Tap) until the Terms box is checked. */}
                {acceptedTerms ? (
                  <GoogleAuthGate>
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setError("Google authentication failed")}
                      useOneTap
                      theme="outline"
                      size="large"
                      text="continue_with"
                      shape="rectangular"
                    />
                  </GoogleAuthGate>
                ) : (
                  <p className="text-sm text-center text-gray-500 dark:text-[var(--text-tertiary)]">
                    Accept the Terms of Use above to continue with Google.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm font-medium text-brand-blue hover:text-blue-500"
              >
                Already have an account? Sign in.
              </Link>
            </div>
          </form>
        </div>
        <LegalLinks className="mt-6 justify-center" />
      </div>
    </div>
  );
}
