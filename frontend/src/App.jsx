import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/authContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DashboardLayout from "./components/DashboardLayout";
import Vault from "./pages/Vault";
import Requests from "./pages/Requests";
import Approvals from "./pages/Approvals";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import Health from "./pages/Health";
import Settings from "./pages/Settings";
import Directory from "./pages/Directory";
import Profile from "./pages/Profile";
import Collections from "./pages/Collections";
import ManagerCollections from "./pages/ManagerCollections";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/vault" />;

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

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

const App = () => (
  <AuthProvider>
    <Router>
      <AppRoutes />
    </Router>
  </AuthProvider>
);

export default App;
