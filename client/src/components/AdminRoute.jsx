import { Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { isStaff } from "../lib/roles.js";

// Hides admin screens from customers; the API still enforces the role on every request.
export default function AdminRoute({ children }) {
  const { user } = useAuth();
  return <ProtectedRoute>{isStaff(user) ? children : <Navigate to="/profile" replace />}</ProtectedRoute>;
}
