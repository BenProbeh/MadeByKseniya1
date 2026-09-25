import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login, authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

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
    return <Navigate to={from === "/login" || from === "/register" ? "/" : from} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await login({ username, password, rememberMe });
      navigate(from === "/login" || from === "/register" ? "/" : from, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || "שם המשתמש או הסיסמה אינם נכונים");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16">
      <h1 className="sr-only">התחברות ל-MadeByKseniya</h1>

      <form onSubmit={onSubmit} className="glass-panel p-6 md:p-8 space-y-5 overflow-visible" noValidate>
        <div className="flex flex-col items-center text-center mb-1">
          <div className="w-full flex justify-center px-1 py-3 overflow-visible">
            <img
              src="/logo.png"
              alt="MadeByKseniya"
              className="block w-[min(88%,360px)] sm:w-[min(90%,380px)] md:w-[min(92%,400px)] max-w-full h-auto object-contain drop-shadow-[0_0_18px_rgba(176,38,255,0.7)]"
            />
          </div>
          <p className="font-serif text-sm text-white/60 mt-4">להתחברות:</p>
        </div>

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
            <button
              type="button"
              className="absolute inset-y-0 left-2.5 flex items-center justify-center w-9 text-violet-200/80 hover:text-violet-100 transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "הסתרת סיסמה" : "הצגת סיסמה"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                  <path d="M3.5 3.5l17 17" />
                  <path d="M10.6 10.7a2.5 2.5 0 003.5 3.5" />
                  <path d="M9.9 5.6A10.5 10.5 0 0121.5 12c-.6 1.1-1.4 2.1-2.4 2.9" />
                  <path d="M6.2 6.4C4.5 7.6 3.1 9.3 2.5 12c1.6 4.1 5.4 7 9.5 7 1.5 0 2.9-.3 4.2-.9" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                  <path d="M2.5 12C4.1 7.9 7.9 5 12 5s7.9 2.9 9.5 7c-1.6 4.1-5.4 7-9.5 7s-7.9-2.9-9.5-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
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

        {error && (
          <p className="text-sm text-red-300 text-center" role="alert" aria-live="assertive">
            {error}
          </p>
        )}

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
