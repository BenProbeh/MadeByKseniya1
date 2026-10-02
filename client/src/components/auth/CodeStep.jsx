import { useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../../lib/authErrors.js";
import { cleanCode } from "../../lib/email.js";

export const AUTH_INPUT_CLASS =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60";

export function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export const clock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function Feedback({ error, info }) {
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

/** Wrong-code errors carry `attemptsLeft`; the lock and other errors come worded from the server. */
export function codeErrorMessage(err, fallback) {
  const left = err?.response?.data?.attemptsLeft;
  const message = getApiErrorMessage(err, fallback);
  return left > 0 ? `${message} נשארו עוד ${left} ניסיונות.` : message;
}

/**
 * Six-digit code entry with expiry and resend timers. `onSubmit(code)` and `onResend()` throw axios errors;
 * `onResend` resolves `{ resendAfterSeconds }`.
 */
export default function CodeStep({
  email,
  expiresAt,
  resendAt,
  info,
  submitLabel = "אימות הקוד",
  onSubmit,
  onResend,
  onChangeEmail,
  changeEmailLabel = "שינוי כתובת האימייל",
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(info || "");
  const [codeExpiresAt, setCodeExpiresAt] = useState(expiresAt);
  const [nextResendAt, setNextResendAt] = useState(resendAt);
  const autoSubmitted = useRef("");
  const inputRef = useRef(null);
  const now = useNow(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const expired = codeExpiresAt > 0 && now >= codeExpiresAt;
  const resendIn = Math.max(0, nextResendAt - now);

  async function submit(value) {
    if (busy || expired) return;
    if (!/^\d{6}$/.test(value)) {
      setError("הקוד צריך להכיל 6 ספרות.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(codeErrorMessage(err, "לא הצלחתי לבדוק את הקוד כרגע. אפשר לנסות שוב."));
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || resendIn > 0) return;
    setBusy(true);
    setError("");
    try {
      const data = await onResend();
      const start = Date.now();
      setCodeExpiresAt(start + (Number(data?.expiresInSeconds) || 600) * 1000);
      setNextResendAt(start + (Number(data?.resendAfterSeconds) || 60) * 1000);
      setCode("");
      autoSubmitted.current = "";
      setNotice("שלחתי קוד חדש. הקוד הקודם כבר לא תקף.");
      inputRef.current?.focus();
    } catch (err) {
      const retry = Number(err?.response?.data?.retryAfterSeconds);
      if (retry > 0) setNextResendAt(Date.now() + retry * 1000);
      setError(getApiErrorMessage(err, "לא הצלחתי לשלוח קוד חדש כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(e) {
    const digits = cleanCode(e.target.value);
    setCode(digits);
    if (error) setError("");
    if (digits.length === 6 && autoSubmitted.current !== digits) {
      autoSubmitted.current = digits;
      void submit(digits);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
      className="glass-panel p-6 md:p-8 space-y-5"
      noValidate
    >
      <p className="text-sm text-white/65 text-center">
        שלחתי קוד אל{" "}
        <bdi dir="ltr" className="text-white/90 break-all">
          {email}
        </bdi>
      </p>
      <Feedback info={!error ? notice : ""} />
      <label className="block space-y-2 text-sm text-white/70 text-center" htmlFor="email-code">
        <span>קוד אימות</span>
        <input
          id="email-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          dir="ltr"
          value={code}
          onChange={onCodeChange}
          maxLength={12}
          aria-describedby="email-code-timer"
          className={`${AUTH_INPUT_CLASS} text-center text-2xl tracking-[0.5em] font-semibold`}
          disabled={expired}
          required
        />
      </label>
      <p id="email-code-timer" className="text-xs text-white/60 text-center" aria-live="polite">
        {expired ? "תוקף הקוד הסתיים. אפשר לבקש קוד חדש." : `הקוד תקף עוד ${clock(codeExpiresAt - now)} דקות.`}
      </p>
      <p className="text-xs text-white/40 text-center">לא מוצאת את המייל? כדאי להציץ גם בתיקיית הספאם או בכרטיסיית קידומי מכירות.</p>
      <Feedback error={error} />
      <button type="submit" className="btn-violet w-full" disabled={busy || expired || code.length !== 6}>
        {busy ? "בודקת…" : submitLabel}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="text-violet-200 hover:text-violet-100 disabled:text-white/40 disabled:cursor-not-allowed"
          disabled={busy || resendIn > 0}
          onClick={() => void resend()}
        >
          {resendIn > 0 ? `שליחת קוד מחדש בעוד ${clock(resendIn)}` : "שליחת קוד מחדש"}
        </button>
        {onChangeEmail && (
          <button type="button" className="text-white/60 hover:text-white" disabled={busy} onClick={onChangeEmail}>
            {changeEmailLabel}
          </button>
        )}
      </div>
    </form>
  );
}
