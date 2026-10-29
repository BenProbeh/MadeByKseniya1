import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { resendVerificationRequest } from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage, isLatinUsername } from "../lib/authErrors.js";
import { safeInternalPath } from "../lib/authPaths.js";

const LATIN_MESSAGE = "האימייל נכתב באותיות בעברית. כדאי להחליף את המקלדת לאנגלית ולנסות שוב.";

export default function Login() {
  const { login, authenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeInternalPath(location.state?.from);
  const passwordRef = useRef(null);

  const resetDone = typeof location.state?.resetDone === "string" ? location.state.resetDone : "";
  const [identifier, setIdentifier] = useState(() => (typeof location.state?.email === "string" ? location.state.email : ""));
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  if (authenticated) return <Navigate to={from} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting || resending) return;
    setError("");
    setUnverifiedEmail("");
    const value = identifier.trim();
    if (!value) {
      setError("נשאר להקליד את האימייל.");
      return;
    }
    if (!isLatinUsername(value)) {
      setError(LATIN_MESSAGE);
      return;
    }
    if (!password) {
      setError("נשאר להקליד את הסיסמה.");
      passwordRef.current?.focus();
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
      state: { email: unverifiedEmail, expiresAt: start + 600 * 1000, resendAt: start + resendAfterSeconds * 1000, rememberMe, from, info },
    });
  }

  return (
    <AuthLayout
      title="ברוכה השבה"
      subtitle="מתחברות כדי לקבוע תור ולראות את המידות שלך."
      footer={
        <>
          עוד אין לך חשבון?{" "}
          <Link to="/register" state={{ from }} className="text-violet-300 font-medium inline-flex min-h-[2.75rem] items-center">
            להרשמה
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="אימייל"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          ltr
          placeholder="name@example.com"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          maxLength={254}
          hint="נרשמת לפני שהיה אימייל באתר? אפשר להתחבר פעם אחת עם שם המשתמש."
        />

        <TextField
          ref={passwordRef}
          label="סיסמה"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          ltr
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 text-sub text-white/75 cursor-pointer select-none min-h-[2.75rem]">
            <input type="checkbox" className="check" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            להישאר מחוברת
          </label>
          <Link to="/forgot-password" state={{ email: identifier.includes("@") ? identifier.trim() : "" }} className="btn-text">
            שכחתי סיסמה
          </Link>
        </div>

        {unverifiedEmail ? (
          <div className="notice-info flex-col" role="status">
            <p>{error}</p>
            <button type="button" className="btn-violet btn-block" disabled={submitting || resending} onClick={() => void continueVerification()}>
              {resending ? "שולחת…" : "שליחת קוד והשלמת האימות"}
            </button>
          </div>
        ) : error ? (
          <p className="notice-error" role="alert">
            {String(error)}
          </p>
        ) : resetDone ? (
          <p className="notice-success" role="status">
            {resetDone}
          </p>
        ) : null}

        <button type="submit" className="btn-violet btn-block" disabled={submitting || resending}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? "מתחברת…" : "התחברות"}
        </button>
      </form>
    </AuthLayout>
  );
}
