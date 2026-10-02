import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { resendVerificationRequest } from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage, isLatinUsername } from "../lib/authErrors.js";
import { safeInternalPath } from "../lib/authPaths.js";

const LATIN_MESSAGE = "האימייל נכתב באותיות באנגלית. כדאי לבדוק שהמקלדת באנגלית ולנסות שוב.";

export default function Login() {
  const { login, authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeInternalPath(location.state?.from);

  const resetDone = typeof location.state?.resetDone === "string" ? location.state.resetDone : "";
  const [identifier, setIdentifier] = useState(() =>
    typeof location.state?.email === "string" ? location.state.email : ""
  );
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

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
    if (submitting || resending) return;
    setError("");
    setUnverifiedEmail("");
    const value = identifier.trim();
    if (!isLatinUsername(value)) {
      setError(LATIN_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const user = await login({ email: value, password, rememberMe });
      if (!user?.id) throw new Error("ההתחברות לא הושלמה");
      navigate(from, { replace: true });
    } catch (err) {
      if (apiErrorCode(err) === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(err.response.data.email || (value.includes("@") ? value.toLowerCase() : ""));
      }
      setError(getApiErrorMessage(err, "האימייל או הסיסמה אינם נכונים."));
    } finally {
      setSubmitting(false);
    }
  }

  async function continueVerification() {
    if (submitting || resending || !unverifiedEmail) return;
    setResending(true);
    const start = Date.now();
    let resendAfterSeconds = 60;
    let info = "שלחתי קוד אימות חדש לכתובת האימייל שלך.";
    try {
      ({ resendAfterSeconds } = await resendVerificationRequest(unverifiedEmail));
    } catch (err) {
      const retry = Number(err?.response?.data?.retryAfterSeconds);
      if (apiErrorCode(err) !== "RESEND_TOO_SOON") {
        setError(getApiErrorMessage(err, "לא הצלחתי לשלוח קוד כרגע. אפשר לנסות שוב בעוד רגע."));
        setResending(false);
        return;
      }
      resendAfterSeconds = retry > 0 ? retry : 60;
      info = "שלחתי לך קוד לפני רגע, הוא מחכה במייל.";
    }
    navigate("/verify-email", {
      state: {
        email: unverifiedEmail,
        expiresAt: start + 600 * 1000,
        resendAt: start + resendAfterSeconds * 1000,
        rememberMe,
        from,
        info,
      },
    });
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <h1 className="sr-only">התחברות ל-MadeByKseniya</h1>

      <div className="flex flex-col items-center text-center overflow-visible">
        <img
          src="/logo.png"
          alt="MadeByKseniya"
          className="w-56 md:w-[16.8rem] h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
        />
        <p className="font-serif text-sm text-white/60 mt-4">להתחברות:</p>
      </div>

      <form onSubmit={onSubmit} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
        <label className="block space-y-2 text-sm text-white/70">
          <span>אימייל</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            placeholder="name@example.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-describedby="login-email-help"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-right outline-none focus:border-violet-400/60"
            maxLength={254}
            required
          />
          <span id="login-email-help" className="block text-xs text-white/40">
            נרשמת לפני שהיה אימייל באתר? אפשר להתחבר פעם אחת עם שם המשתמש ולהוסיף כתובת.
          </span>
        </label>

        <label className="block space-y-2 text-sm text-white/70">
          <span>סיסמה</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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

        <div className="flex justify-end -mt-2">
          <Link to="/forgot-password" className="text-sm text-violet-200 hover:text-violet-100">
            שכחתי סיסמה
          </Link>
        </div>

        <label className="flex items-center gap-3 text-sm text-white/65 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-white/30"
          />
          <span>זכרי אותי</span>
        </label>

        {unverifiedEmail ? (
          <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 space-y-3 text-center" role="status" aria-live="polite">
            <p className="text-sm text-violet-100">{error}</p>
            <button type="button" className="btn-violet w-full" disabled={submitting || resending} onClick={() => void continueVerification()}>
              {resending ? "שולחת…" : "שליחת קוד חדש והשלמת האימות"}
            </button>
          </div>
        ) : error ? (
          <p className="text-sm text-red-300 text-center" role="alert" aria-live="assertive">
            {String(error)}
          </p>
        ) : resetDone ? (
          <p className="text-sm text-violet-200 text-center" role="status" aria-live="polite">
            {resetDone}
          </p>
        ) : null}

        <button type="submit" className="btn-violet w-full" disabled={submitting || resending}>
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
