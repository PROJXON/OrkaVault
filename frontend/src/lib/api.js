import axios from "axios";

// Standardize the API base URL (ensures /api is appended if omitted)
const rawBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:5001";
export const API_BASE_URL = rawBaseUrl.endsWith("/api")
  ? rawBaseUrl
  : `${rawBaseUrl.replace(/\/$/, "")}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Auth is cookie-only: the access/refresh tokens are httpOnly cookies the
// browser attaches itself (withCredentials). Nothing auth-related is ever
// stored in localStorage or set as an Authorization header here.
//
// CSRF: the backend (middleware/csrf.ts) requires an X-CSRF-Token header on
// every non-GET request. The token comes from GET /auth/csrf and is held
// only in memory, fetched lazily on the first unsafe request.
const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);
let csrfToken = null;
let csrfPromise = null;

const fetchCsrfToken = () => {
  if (!csrfPromise) {
    csrfPromise = axios
      .get(`${API_BASE_URL}/auth/csrf`, { withCredentials: true })
      .then(({ data }) => {
        csrfToken = data.csrfToken;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
};

const csrfHeaders = async () => ({ "X-CSRF-Token": csrfToken || (await fetchCsrfToken()) });

api.interceptors.request.use(
  async (config) => {
    if (UNSAFE_METHODS.has((config.method || "get").toLowerCase())) {
      config.headers = config.headers || {};
      config.headers["X-CSRF-Token"] = csrfToken || (await fetchCsrfToken());
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: re-fetch a stale CSRF token once, refresh the access
// cookie on 401.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "CSRF_INVALID" &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      csrfToken = null;
      return api(originalRequest);
    }

    // The backend enforces the System Use Notice / Terms gate. If a version
    // was bumped while this tab was open, reload: /auth/me (always allowed)
    // then reports the flags and ProtectedRoute shows the gate.
    if (error.response?.status === 403 && error.response?.data?.legalAcknowledgmentRequired) {
      window.location.reload();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // No body: the refreshToken cookie carries it. A new accessToken
        // cookie comes back, so the original request just needs re-sending.
        await axios.post(`${API_BASE_URL}/auth/refresh`, null, {
          withCredentials: true,
          headers: await csrfHeaders(),
        });
        return api(originalRequest);
      } catch (err) {
        // Public pages (sign-in, registration, /legal/*) must stay reachable
        // while logged out. The desktop app routes via the #fragment
        // (HashRouter under file://), so read and set the route there.
        const hashRouted = window.location.protocol === "file:";
        const route = hashRouted ? window.location.hash.slice(1) || "/" : window.location.pathname;
        const isPublic = route === "/login" || route === "/register" || route.startsWith("/legal/");
        if (!isPublic) {
          if (hashRouted) window.location.hash = "#/login";
          else window.location.href = "/login";
        }
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  },
);

export default api;