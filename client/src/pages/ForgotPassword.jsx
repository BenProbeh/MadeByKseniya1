import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import CodeStep, { AUTH_INPUT_CLASS, Feedback } from "../components/auth/CodeStep.jsx";
import {
  completePasswordResetRequest,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";

const SENT_MESSAGE = "אם קיים חשבון עם כתובת האימייל הזאת, שלחתי אליו קוד לאיפוס הסיסמה.";

function PasswordField({ id, label, autoComplete, value, onChange, describedBy }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block space-y-2 text-sm text-white/70" htmlFor={id}>
      <span>{label}</span>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          className={`${AUTH_INPUT_CLASS} pe-12`}
          maxLength={128}
          required
        />
        <PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />
      </div>
    </label>
  );
}

export default function ForgotPassword() {
  const { authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [emailInput, setEmailInput] = useState("");
  const [sent, setSent] = useState(null);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
      </div>
    );
  }
  if (authenticated) return <Navigate to="/profile" replace />;

  async function onEmailSubmit(e) {
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
      const data = await requestPasswordResetCode(checked.email);
      const start = Date.now();
      setSent({
        email: checked.email,
        expiresAt: start + (Number(data?.expiresInSeconds) || 600) * 1000,
        resendAt: start + (Number(data?.resendAfterSeconds) || 60) * 1000,
        info: data?.message || SENT_MESSAGE,
      });
      setStep("code");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשלוח קוד כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(code) {
    const data = await verifyPasswordResetCode(sent.email, code);
    setResetToken(data.resetToken);
    setError("");
    setStep("password");
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function onPasswordSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (newPassword.length < 8) return setError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים.");
    if (newPassword.length > 128) return setError("הסיסמה החדשה ארוכה מדי.");
    if (newPassword !== confirmPassword) return setError(mismatch ? "" : "אימות הסיסמה החדשה אינו תואם.");
    setBusy(true);
    setError("");
    try {
      const data = await completePasswordResetRequest({ resetToken, newPassword, confirmPassword });
      setResetToken("");
      navigate("/login", {
        replace: true,
        state: {
          resetDone: data?.message || "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
          email: typeof data?.email === "string" ? data.email : sent?.email || "",
        },
      });
    } catch (err) {
      if (apiErrorCode(err) === "RESET_EXPIRED") {
        setResetToken("");
        setNewPassword("");
        setConfirmPassword("");
        setStep("email");
      }
      setError(getApiErrorMessage(err, "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <div className="flex flex-col items-center text-center overflow-visible">
        <Link to="/login" aria-label="חזרה להתחברות">
          <img
            src="/logo.png"
            alt="MadeByKseniya"
            className="w-44 md:w-52 h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
          />
        </Link>
        <h1 className="font-serif text-2xl text-white mt-4">שכחתי סיסמה</h1>
        <p className="font-serif text-sm text-white/60 mt-2">
          {step === "email" && "אין בעיה. אשלח לך קוד לכתובת האימייל שאיתה נרשמת."}
          {step === "code" && "הקלידי את הקוד בן 6 הספרות ששלחתי לך במייל."}
          {step === "password" && "הקוד אומת. נשאר רק לבחור סיסמה חדשה."}
        </p>
      </div>

      {step === "email" && (
        <form onSubmit={onEmailSubmit} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
          <label className="block space-y-2 text-sm text-white/70" htmlFor="reset-email">
            <span>אימייל</span>
            <input
              id="reset-email"
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
            {busy ? "שולחת…" : "שליחת קוד לאיפוס"}
          </button>
        </form>
      )}

      {step === "code" && sent && (
        <CodeStep
          key={sent.expiresAt}
          email={sent.email}
          expiresAt={sent.expiresAt}
          resendAt={sent.resendAt}
          info={sent.info}
          onSubmit={submitCode}
          onResend={() => requestPasswordResetCode(sent.email)}
          onChangeEmail={() => {
            setStep("email");
            setError("");
          }}
        />
      )}

      {step === "password" && (
        <form onSubmit={onPasswordSubmit} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
          <PasswordField
            id="reset-new-password"
            label="סיסמה חדשה"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            describedBy="reset-password-policy"
          />
          <PasswordField
            id="reset-confirm-password"
            label="אימות סיסמה חדשה"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            describedBy="reset-password-match"
          />
          <p id="reset-password-policy" className="text-xs text-white/40">
            לפחות 8 תווים. אחרי העדכון, כל המכשירים שהיו מחוברים לחשבון יתנתקו.
          </p>
          <p id="reset-password-match" className="text-xs text-amber-200 min-h-[1rem]" aria-live="polite">
            {mismatch ? "הסיסמאות עדיין לא תואמות." : ""}
          </p>
          <Feedback error={error} />
          <button type="submit" className="btn-violet w-full" disabled={busy}>
            {busy ? "מעדכנת…" : "עדכון הסיסמה"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-white/55">
        נזכרת בסיסמה?{" "}
        <Link to="/login" className="text-violet-200 hover:text-violet-100">
          חזרה להתחברות
        </Link>
      </p>
    </div>
  );
}
