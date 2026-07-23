import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { GoogleLogin } from "@react-oauth/google";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import logo from "../assets/OrkaVault.png";
import { generateDeviceKey, signChallenge, savePrivateKey } from "../lib/webCryptoMfa";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  
  // MFA States
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [challenge, setChallenge] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, continueWithGoogle, mfaVerify } = useAuth();
  const navigate = useNavigate();

  // Attempt auto-signing if device is remembered
  const attemptDeviceSigning = async (challengeStr, token) => {
    const mfaDeviceId = localStorage.getItem("mfaDeviceId");
    if (!mfaDeviceId) return false;

    try {
      setIsLoading(true);
      const signature = await signChallenge(mfaDeviceId, challengeStr);
      await mfaVerify({
        tempToken: token,
        signature,
        mfaDeviceId,
      });
      navigate("/");
      return true;
    } catch (err) {
      console.warn("Could not sign challenge automatically. Falling back to TOTP.", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await login(email, password);
      if (res?.mfaRequired) {
        setTempToken(res.tempToken);
        setChallenge(res.challenge);
        
        // Attempt automatic Web Crypto key signature bypass
        const signed = await attemptDeviceSigning(res.challenge, res.tempToken);
        if (!signed) {
          setMfaRequired(true);
        }
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError("");
    try {
      const res = await continueWithGoogle(credentialResponse.credential);
      if (res.action === "login") {
        if (res.mfaRequired) {
          setTempToken(res.tempToken);
          setChallenge(res.challenge);
          
          const signed = await attemptDeviceSigning(res.challenge, res.tempToken);
          if (!signed) {
            setMfaRequired(true);
          }
        } else {
          navigate("/");
        }
      } else if (res.action === "register") {
        navigate("/register", { state: { googleData: res.data } });
      }
    } catch (err) {
      setError(err.response?.data?.error || "Google login failed");
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!totpCode) {
      setError("Please enter your MFA verification code.");
      return;
    }

    try {
      setIsLoading(true);
      let deviceKeyData = null;
      let deviceName = "";

      if (rememberDevice) {
        // Generate cryptographic key pair on the browser
        deviceKeyData = await generateDeviceKey();
        
        // Get simple device descriptive label
        const userAgent = navigator.userAgent;
        let os = "Linux";
        if (userAgent.includes("Windows")) os = "Windows";
        else if (userAgent.includes("Mac")) os = "macOS";
        
        let browser = "Browser";
        if (userAgent.includes("Chrome")) browser = "Chrome";
        else if (userAgent.includes("Firefox")) browser = "Firefox";
        else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";

        deviceName = `${browser} on ${os} (${new Date().toLocaleDateString()})`;
      }

      const res = await mfaVerify({
        tempToken,
        totpCode,
        ...(rememberDevice && deviceKeyData && {
          deviceName,
          publicKey: deviceKeyData.publicKey,
        }),
      });

      // If a device key registration succeeded, save private key to IndexedDB
      if (rememberDevice && res.mfaDeviceId && deviceKeyData) {
        await savePrivateKey(res.mfaDeviceId, deviceKeyData.privateKey);
      }

      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "MFA verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg-canvas)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center mb-4">
          <img
            src={logo}
            alt="OrkaVault"
            className="h-20 w-auto object-contain"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-[var(--text-primary)]">
          {mfaRequired ? "Security Verification" : "Sign in to your account"}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-[var(--bg-surface)] py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {error && (
            <div className="mb-6 bg-red-50 border-l-4 border-brand-red p-4">
              <p className="text-sm text-brand-red">{error}</p>
            </div>
          )}

          {mfaRequired ? (
            <form className="space-y-6" onSubmit={handleMfaSubmit}>
              <div className="text-center text-gray-600 dark:text-[var(--text-secondary)]">
                <ShieldCheck className="h-12 w-12 mx-auto text-brand-blue mb-2 animate-pulse" />
                <p className="text-sm">
                  Enter the 6-digit code from your authenticator app to complete sign in.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                  Verification Code
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    className="appearance-none block w-full text-center tracking-widest text-lg font-bold px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
                    placeholder="123456"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-device"
                  name="remember-device"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded"
                  disabled={isLoading}
                />
                <label htmlFor="remember-device" className="ml-2 block text-sm text-gray-900 dark:text-[var(--text-secondary)]">
                  Remember this device (uses cryptographic keys)
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50"
                >
                  {isLoading ? "Verifying..." : "Verify Code"}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMfaRequired(false);
                    setError("");
                    setTotpCode("");
                  }}
                  className="text-sm font-medium text-brand-blue hover:text-blue-500"
                  disabled={isLoading}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
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
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
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
                    className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-[var(--border-default)] rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
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
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue"
                >
                  Sign in
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
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google login failed")}
                    useOneTap
                    theme="outline"
                    size="large"
                    text="continue_with"
                    shape="rectangular"
                  />
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/register"
                  className="text-sm font-medium text-brand-blue hover:text-blue-500"
                >
                  Don't have an account? Register here.
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
