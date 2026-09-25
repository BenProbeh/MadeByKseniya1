import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { authenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-6">
        <div className="glass-panel px-8 py-6 text-center space-y-2">
          <span className="section-eyebrow justify-center">MadeByKseniya</span>
          <p className="font-serif text-white/70 text-sm">רגע אחד, בודקים את החיבור…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
