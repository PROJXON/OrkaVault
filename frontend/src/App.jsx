import React from "react";
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ContentProvider } from "./lib/content";
import ConsentBanner from "./components/ConsentBanner";
import SystemUseNotice from "./components/SystemUseNotice";
import Login from "./pages/Login";
import Register from "./pages/Register";
import LegalPage from "./pages/legal/LegalPage";
import { LegalVersionList, LegalVersionView } from "./pages/legal/LegalVersions";
import DashboardLayout from "./components/DashboardLayout";
import Vault from "./pages/Vault";
import Requests from "./pages/Requests";
import Approvals from "./pages/Approvals";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import WorkspaceActivity from "./pages/WorkspaceActivity";
import Health from "./pages/Health";
import Settings from "./pages/Settings";
import Directory from "./pages/Directory";
import Profile from "./pages/Profile";
import Collections from "./pages/Collections";
import ManagerCollections from "./pages/ManagerCollections";
import ManageConsole from "./pages/ManageConsole";

import { useLocation } from "react-router-dom";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/login" />;

  // Policy gate (NEW-FEAT §3.2, Phase 4b): Terms / Privacy / System Use
  // Notice that are new to the user or re-published with re-acceptance.
  // Must come before the MFA redirect so a new user acknowledges first.
  // pendingAcceptances comes from the real user record; a viewAsRole
  // preview only swaps `role`.
  if (user.pendingAcceptances?.length) {
    return <SystemUseNotice pending={user.pendingAcceptances} />;
  }

  // Force MFA setup redirect
  if (!user.mfaEnabled && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/vault" />;

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/legal/:page" element={<LegalPage />} />
      <Route path="/legal/:page/versions" element={<LegalVersionList />} />
      <Route path="/legal/:page/versions/:version" element={<LegalVersionView />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/vault" />} />
        <Route path="vault" element={<Vault />} />
        <Route path="requests" element={<Requests />} />
        <Route path="profile" element={<Profile />} />

        {/* MANAGER & ADMIN routes */}
        <Route
          path="manage"
          element={
            <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]}>
              <ManageConsole />
            </ProtectedRoute>
          }
        />
        <Route
          path="approvals"
          element={
            <ProtectedRoute allowedRoles={["MANAGER", "ADMIN"]}>
              <Approvals />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-collections"
          element={
            <ProtectedRoute allowedRoles={["MANAGER"]}>
              <ManagerCollections />
            </ProtectedRoute>
          }
        />

        {/* ADMIN ONLY routes */}
        <Route
          path="directory"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Directory />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="collections"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Collections />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Audit />
            </ProtectedRoute>
          }
        />
        <Route
          path="workspace-activity"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <WorkspaceActivity />
            </ProtectedRoute>
          }
        />
        <Route
          path="health"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Health />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
};

// The packaged desktop app loads dist/index.html from file://, where the
// path is the file's location on disk and no server can fall back to
// index.html for /vault, /legal/terms, etc. Route via the #fragment there.
const Router = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

// ConsentBanner sits inside the router so its legal links can navigate.
// ContentProvider serves the published policy/banner text (Phase 4b).
const App = () => (
  <AuthProvider>
    <ContentProvider>
      <Router>
        <ConsentBanner />
        <AppRoutes />
      </Router>
    </ContentProvider>
  </AuthProvider>
);

export default App;
