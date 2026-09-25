import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { getApiErrorMessage } from "../lib/authErrors.js";

export default function Login() {
  const { login, authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    !location.state.from.startsWith("//") &&
    location.state.from !== "/login" &&
    location.state.from !== "/register"
      ? location.state.from
      : "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const user = await login({ username, password, rememberMe });
      if (!user?.id) throw new Error("ההתחברות לא הושלמה");
      navigate(from, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "שם המשתמש או הסיסמה אינם נכונים"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <h1 className="sr-only">התחברות ל-MadeByKseniya</h1>

      <div className="flex flex-col items-center text-center overflow-visible">
        <img
          src="/madebykseniya-logo-clean.png"
          alt="MadeByKseniya"
          className="w-56 md:w-[16.8rem] h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
        />
        <p className="font-serif text-sm text-white/60 mt-4">להתחברות:</p>
      </div>

      <form onSubmit={onSubmit} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
        <label className="block space-y-2 text-sm text-white/70">
          <span>שם משתמש</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            required
          />
        </label>

        <label className="block space-y-2 text-sm text-white/70">
          <span>סיסמה</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60 pe-12"
              required
            />
            <PasswordVisibilityToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
        </label>

        <label className="flex items-center gap-3 text-sm text-white/65 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-white/30"
          />
          <span>זכרי אותי</span>
        </label>

        {error ? (
          <p className="text-sm text-red-300 text-center" role="alert" aria-live="assertive">
            {String(error)}
          </p>
        ) : null}

        <button type="submit" className="btn-violet w-full" disabled={submitting}>
          {submitting ? "מתחברת…" : "התחברות"}
        </button>
      </form>

      <p className="text-center text-sm text-white/55 mt-6">
        עדיין אין לך חשבון?{" "}
        <Link to="/register" className="text-violet-200 hover:text-violet-100">
          הרשמי כאן
        </Link>
      </p>
    </div>
  );
}
