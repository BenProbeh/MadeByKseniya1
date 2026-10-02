import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import CodeStep, { AUTH_INPUT_CLASS, Feedback } from "../components/auth/CodeStep.jsx";
import { resendVerificationRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";
import { safeInternalPath } from "../lib/authPaths.js";

/** Completes sign-up: the 6-digit code from the email activates the account and signs her in. */
export default function VerifyEmail() {
  const { verifyEmail, authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const from = safeInternalPath(state.from);
  const rememberMe = state.rememberMe !== false;

  const [pending, setPending] = useState(() =>
    typeof state.email === "string" && state.email
      ? { email: state.email, expiresAt: Number(state.expiresAt) || 0, resendAt: Number(state.resendAt) || 0, info: state.info || "" }
      : null
  );
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
      </div>
    );
  }
  if (authenticated && !done) return <Navigate to={from} replace />;

  async function requestCode(e) {
    e.preventDefault();
    if (busy) return;
    const checked = normalizeEmail(emailInput);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await resendVerificationRequest(checked.email);
      const start = Date.now();
      setPending({
        email: checked.email,
        expiresAt: start + 600 * 1000,
        resendAt: start + data.resendAfterSeconds * 1000,
        info: "אם החשבון הזה ממתין לאימות, שלחתי אליו קוד חדש.",
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשלוח קוד כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(code) {
    setDone(true);
    try {
      await verifyEmail({ email: pending.email, code, rememberMe });
    } catch (err) {
      setDone(false);
      throw err;
    }
    navigate(from, { replace: true, state: { welcome: true } });
  }

  async function resend() {
    const data = await resendVerificationRequest(pending.email);
    return { ...data, expiresInSeconds: 600 };
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <div className="flex flex-col items-center text-center overflow-visible">
        <img
          src="/logo.png"
          alt="MadeByKseniya"
          className="w-44 md:w-52 h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
        />
        <h1 className="font-serif text-2xl text-white mt-4">אימות כתובת האימייל</h1>
        <p className="font-serif text-sm text-white/60 mt-2">
          {pending
            ? "הקלידי את הקוד בן 6 הספרות ששלחתי לך, והחשבון יופעל מיד."
            : "הזיני את כתובת האימייל שאיתה נרשמת, ואשלח קוד אימות חדש."}
        </p>
      </div>

      {pending ? (
        <CodeStep
          key={pending.email}
          email={pending.email}
          expiresAt={pending.expiresAt}
          resendAt={pending.resendAt}
          info={pending.info}
          submitLabel="אימות והפעלת החשבון"
          onSubmit={submitCode}
          onResend={resend}
          onChangeEmail={() => {
            setPending(null);
            setEmailInput("");
          }}
          changeEmailLabel="כתובת אחרת"
        />
      ) : (
        <form onSubmit={requestCode} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
          <label className="block space-y-2 text-sm text-white/70" htmlFor="verify-email-address">
            <span>אימייל</span>
            <input
              id="verify-email-address"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              placeholder="name@example.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (error) setError("");
              }}
              className={`${AUTH_INPUT_CLASS} text-right`}
              maxLength={254}
              required
            />
          </label>
          <Feedback error={error} />
          <button type="submit" className="btn-violet w-full" disabled={busy}>
            {busy ? "שולחת…" : "שליחת קוד אימות"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-white/55">
        כבר אימתת?{" "}
        <Link to="/login" className="text-violet-200 hover:text-violet-100">
          להתחברות
        </Link>
      </p>
    </div>
  );
}
