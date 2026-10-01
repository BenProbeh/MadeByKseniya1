import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import {
  completePasswordResetRequest,
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizePhone } from "../lib/phone.js";

const INPUT_CLASS =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60";
const PHONE_INVALID = "מספר הטלפון לא נראה תקין. אפשר לכתוב נייד ישראלי, למשל 050-1234567.";
const SENT_MESSAGE = "אם המספר קיים במערכת, אשלח אליו קוד להמשך.";

/** Server message for the codes this page handles itself (503 would otherwise map to a generic text). */
function resetError(err, fallback) {
  const data = err?.response?.data;
  const code = data?.error?.code;
  if (code === "SMS_UNAVAILABLE" && typeof data.error.message === "string") return data.error.message;
  return getApiErrorMessage(err, fallback);
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const clock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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
          className={`${INPUT_CLASS} pe-12`}
          maxLength={128}
          required
        />
        <PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />
      </div>
    </label>
  );
}

function Feedback({ error, info }) {
  if (error) {
    return (
      <p className="text-sm text-red-300 text-center" role="alert" aria-live="assertive">
        {error}
      </p>
    );
  }
  if (info) {
    return (
      <p className="text-sm text-violet-200 text-center" role="status" aria-live="polite">
        {info}
      </p>
    );
  }
  return null;
}

export default function ForgotPassword() {
  const { authenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState(null);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const codeRef = useRef(null);
  const autoSubmitted = useRef("");
  const now = useNow(step === "code");

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
      </div>
    );
  }
  if (authenticated) return <Navigate to="/profile" replace />;

  const expired = step === "code" && expiresAt > 0 && now >= expiresAt;
  const resendIn = Math.max(0, resendAt - now);

  async function sendCode(target) {
    setBusy(true);
    setError("");
    try {
      const data = await requestPasswordResetCode(target.e164);
      const start = Date.now();
      setPhone(target);
      setExpiresAt(start + (Number(data?.expiresInSeconds) || 600) * 1000);
      setResendAt(start + (Number(data?.resendAfterSeconds) || 60) * 1000);
      setCode("");
      autoSubmitted.current = "";
      setInfo(data?.message || SENT_MESSAGE);
      setStep("code");
    } catch (err) {
      const retry = Number(err?.response?.data?.retryAfterSeconds);
      if (retry > 0 && phone?.e164 === target.e164) setResendAt(Date.now() + retry * 1000);
      setError(resetError(err, "לא הצלחתי לשלוח קוד כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  function onPhoneSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const checked = normalizePhone(phoneInput);
    if (!checked.ok) {
      setError(checked.error === "יש להזין מספר טלפון." ? checked.error : PHONE_INVALID);
      return;
    }
    void sendCode(checked);
  }

  async function submitCode(value) {
    if (busy || expired) return;
    if (!/^\d{6}$/.test(value)) {
      setError("הקוד צריך להכיל 6 ספרות.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await verifyPasswordResetCode(phone.e164, value);
      setResetToken(data.resetToken);
      setCode("");
      setInfo("");
      setStep("password");
    } catch (err) {
      const left = err?.response?.data?.attemptsLeft;
      const message = resetError(err, "לא הצלחתי לבדוק את הקוד כרגע. אפשר לנסות שוב.");
      setError(left > 0 ? `${message} נשארו עוד ${left} ניסיונות.` : message);
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError("");
    if (digits.length === 6 && autoSubmitted.current !== digits) {
      autoSubmitted.current = digits;
      void submitCode(digits);
    }
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
          username: typeof data?.username === "string" ? data.username : "",
        },
      });
    } catch (err) {
      if (err?.response?.data?.error?.code === "RESET_EXPIRED") {
        setResetToken("");
        setNewPassword("");
        setConfirmPassword("");
        setStep("phone");
      }
      setError(resetError(err, "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע."));
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
          {step === "phone" && "אין בעיה. אשלח לך קוד ב־SMS למספר שאיתו נרשמת."}
          {step === "code" && "הקלידי את הקוד בן 6 הספרות שקיבלת ב־SMS."}
          {step === "password" && "הקוד אומת. נשאר רק לבחור סיסמה חדשה."}
        </p>
      </div>

      {step === "phone" && (
        <form onSubmit={onPhoneSubmit} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
          <label className="block space-y-2 text-sm text-white/70" htmlFor="reset-phone">
            <span>מספר טלפון</span>
            <input
              id="reset-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="050-1234567"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                if (error) setError("");
              }}
              aria-describedby="reset-phone-help"
              className={`${INPUT_CLASS} text-right`}
              maxLength={20}
              required
            />
          </label>
          <p id="reset-phone-help" className="text-xs text-white/40">
            נייד ישראלי, למשל 050-1234567 או ‎+972501234567.
          </p>
          <Feedback error={error} />
          <button type="submit" className="btn-violet w-full" disabled={busy}>
            {busy ? "שולחת…" : "שליחת קוד ב־SMS"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(code);
          }}
          className="glass-panel p-6 md:p-8 space-y-5"
          noValidate
        >
          <Feedback info={!error ? info : ""} />
          <label className="block space-y-2 text-sm text-white/70 text-center" htmlFor="reset-code">
            <span>קוד אימות</span>
            <input
              id="reset-code"
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              dir="ltr"
              value={code}
              onChange={onCodeChange}
              maxLength={12}
              aria-describedby="reset-code-timer"
              className={`${INPUT_CLASS} text-center text-2xl tracking-[0.5em] font-semibold`}
              disabled={expired}
              required
            />
          </label>
          <p id="reset-code-timer" className="text-xs text-white/60 text-center" aria-live="polite">
            {expired ? "תוקף הקוד הסתיים. אפשר לבקש קוד חדש." : `הקוד תקף עוד ${clock(expiresAt - now)} דקות.`}
          </p>
          <Feedback error={error} />
          <button type="submit" className="btn-violet w-full" disabled={busy || expired || code.length !== 6}>
            {busy ? "בודקת…" : "אימות הקוד"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              type="button"
              className="text-violet-200 hover:text-violet-100 disabled:text-white/40 disabled:cursor-not-allowed"
              disabled={busy || resendIn > 0}
              onClick={() => void sendCode(phone)}
            >
              {resendIn > 0 ? `שליחת קוד מחדש בעוד ${clock(resendIn)}` : "שליחת קוד מחדש"}
            </button>
            <button
              type="button"
              className="text-white/60 hover:text-white"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setError("");
                setInfo("");
              }}
            >
              שינוי המספר
            </button>
          </div>
        </form>
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
