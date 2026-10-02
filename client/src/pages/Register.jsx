import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { getApiErrorMessage, isLatinUsername, USERNAME_LATIN_MESSAGE } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";
import { safeInternalPath } from "../lib/authPaths.js";

export default function Register() {
  const { register, authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeInternalPath(location.state?.from);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-6">
        <div className="glass-panel px-8 py-6 text-center space-y-2">
          <img src="/logo.png" alt="" className="h-16 w-auto mx-auto object-contain opacity-90" />
          <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
        </div>
      </div>
    );
  }

  if (authenticated && !submitting) {
    return <Navigate to={from} replace />;
  }

  const emailCheck = normalizeEmail(email);
  const emailError = emailTouched && !emailCheck.ok ? emailCheck.error : "";

  async function onSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    if (submitting) return;

    setError("");
    if (!isLatinUsername(username)) {
      setError(USERNAME_LATIN_MESSAGE);
      return;
    }
    if (!emailCheck.ok) {
      setEmailTouched(true);
      setError(emailCheck.error);
      return;
    }
    if (password.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים.");
      return;
    }
    if (password !== confirmPassword) {
      setError("אימות הסיסמה אינו תואם.");
      return;
    }

    setSubmitting(true);
    try {
      const pending = await register({
        firstName,
        lastName,
        username,
        email: emailCheck.email,
        password,
        confirmPassword,
      });
      const start = Date.now();
      setPassword("");
      setConfirmPassword("");
      navigate("/verify-email", {
        replace: true,
        state: {
          email: pending.email,
          expiresAt: start + pending.expiresInSeconds * 1000,
          resendAt: start + pending.resendAfterSeconds * 1000,
          rememberMe,
          from,
        },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי ליצור את החשבון כרגע. נסי שוב בעוד רגע."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Join</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          בואי ניצור לך <span className="violet-text">פרופיל</span>
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base">
          כאן אשמור את המידות, ההזמנות וכל מה שצריך לפעם הבאה.
        </p>
      </div>

      <form onSubmit={onSubmit} className="glass-panel p-6 md:p-8 space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-2 text-sm text-white/70">
            <span>שם פרטי</span>
            <input
              type="text"
              name="given-name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
              required
            />
          </label>
          <label className="block space-y-2 text-sm text-white/70">
            <span>שם משפחה</span>
            <input
              type="text"
              name="family-name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
              required
            />
          </label>
        </div>

        <label className="block space-y-2 text-sm text-white/70">
          <span>שם משתמש</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            required
          />
        </label>

        <div className="space-y-2">
        <label className="block space-y-2 text-sm text-white/70">
          <span>אימייל</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(Boolean(email.trim()) || emailTouched)}
            aria-invalid={Boolean(emailError)}
            aria-describedby="register-email-help"
            className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-base text-right outline-none focus:border-violet-400/60 ${
              emailError ? "border-amber-300/60" : "border-white/10"
            }`}
            maxLength={254}
            required
          />
        </label>
          <p id="register-email-help" className={`text-xs ${emailError ? "text-amber-200" : "text-white/40"}`} aria-live="polite">
            {emailError || "אשלח לכאן קוד אימות כדי להפעיל את החשבון."}
          </p>
        </div>

        <label className="block space-y-2 text-sm text-white/70">
          <span>סיסמה</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="new-password"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60 pe-12"
              required
              minLength={8}
            />
            <PasswordVisibilityToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
        </label>

        <label className="block space-y-2 text-sm text-white/70">
          <span>אימות סיסמה</span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="confirm-password"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60 pe-12"
              required
              minLength={8}
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
          {submitting ? "יוצרות לך חשבון…" : "יצירת חשבון"}
        </button>
      </form>

      <p className="text-center text-sm text-white/55">
        כבר יש לך חשבון?{" "}
        <Link to="/login" className="text-violet-200 hover:text-violet-100">
          התחברי כאן
        </Link>
      </p>
    </div>
  );
}
