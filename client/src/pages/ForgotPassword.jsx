import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import CodeStep, { Feedback } from "../components/auth/CodeStep.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import {
  completePasswordResetRequest,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";

const SENT_MESSAGE = "אם קיים חשבון עם כתובת האימייל הזאת, שלחתי אליו קוד לאיפוס הסיסמה.";

function PasswordField({ label, autoComplete, value, onChange, hint, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      ltr
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={128}
      hint={hint}
      error={error}
      trailing={<PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />}
    />
  );
}

export default function ForgotPassword() {
  const { authenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [emailInput, setEmailInput] = useState(() => (typeof location.state?.email === "string" ? location.state.email : ""));
  const [sent, setSent] = useState(null);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <AuthLayout
      compactLogo
      back={step === "email" ? "/login" : undefined}
      title={step === "password" ? "סיסמה חדשה" : "שכחתי סיסמה"}
      subtitle={
        step === "email"
          ? "אין בעיה. אשלח קוד לכתובת שאיתה נרשמת."
          : step === "code"
            ? "הקלידי את הקוד ששלחתי לך במייל."
            : "הקוד אומת. נשאר לבחור סיסמה חדשה."
      }
      footer={
        <>
          נזכרת?{" "}
          <Link to="/login" className="text-violet-300 font-medium inline-flex min-h-[2.75rem] items-center">
            חזרה להתחברות
          </Link>
        </>
      }
    >
      {step === "email" && (
        <form onSubmit={onEmailSubmit} className="space-y-4" noValidate>
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
            {busy ? "שולחת…" : "שליחת קוד"}
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
        <form onSubmit={onPasswordSubmit} className="space-y-4" noValidate>
          <PasswordField
            label="סיסמה חדשה"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            hint="לפחות 8 תווים. אחרי העדכון, מכשירים אחרים שהיו מחוברים יתנתקו."
          />
          <PasswordField
            label="שוב, לאימות"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            error={mismatch ? "הסיסמאות עדיין לא תואמות." : ""}
          />
          <Feedback error={error} />
          <button type="submit" className="btn-violet btn-block" disabled={busy}>
            {busy ? "מעדכנת…" : "עדכון הסיסמה"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
