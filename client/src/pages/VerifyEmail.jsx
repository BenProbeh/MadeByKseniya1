import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import CodeStep, { Feedback } from "../components/auth/CodeStep.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import { resendVerificationRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";
import { safeInternalPath } from "../lib/authPaths.js";

/** Completes sign-up: the 6-digit code from the email activates the account and signs her in. */
export default function VerifyEmail() {
  const { verifyEmail, authenticated } = useAuth();
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
    <AuthLayout
      compactLogo
      back="/login"
      eyebrow="Verify"
      title="אימות"
      accent="האימייל"
      subtitle={pending ? "הקלידי את הקוד ששלחתי, והחשבון יופעל מיד." : "הקלידי את האימייל שאיתו נרשמת, ואשלח קוד חדש."}
      footer={
        <>
          כבר אימתת?{" "}
          <Link to="/login" className="text-violet-300 font-medium inline-flex min-h-[2.75rem] items-center">
            להתחברות
          </Link>
        </>
      }
    >
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
        <form onSubmit={requestCode} className="space-y-4" noValidate>
          <TextField
            label="אימייל"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            ltr
            placeholder="name@example.com"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              if (error) setError("");
            }}
            maxLength={254}
          />
          <Feedback error={error} />
          <button type="submit" className="btn-violet btn-block" disabled={busy}>
            {busy ? "שולחת…" : "שליחת קוד אימות"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
