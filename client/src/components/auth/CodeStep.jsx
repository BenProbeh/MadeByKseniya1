import { useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../../lib/authErrors.js";
import { cleanCode } from "../../lib/email.js";
import { DevMailNotice } from "./AuthLayout.jsx";

export const AUTH_INPUT_CLASS = "input";

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
      <p className="notice-error" role="alert" aria-live="assertive">
        {error}
      </p>
    );
  }
  if (info) {
    return (
      <p className="notice-info" role="status" aria-live="polite">
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
      className="space-y-4"
      noValidate
    >
      <p className="t-sub text-center">
        שלחתי קוד בן 6 ספרות אל
        <bdi dir="ltr" className="block mt-1 text-white [overflow-wrap:anywhere]">
          {email}
        </bdi>
      </p>
      <DevMailNotice />
      <Feedback info={!error ? notice : ""} />
      <div className="field">
        <label className="field-label text-center" htmlFor="email-code">
          קוד אימות
        </label>
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
          aria-invalid={error ? true : undefined}
          className="input text-center font-display text-[1.75rem] tracking-[0.45em] tnum min-h-[4rem]"
          disabled={expired}
          placeholder="••••••"
          required
        />
        <p id="email-code-timer" className="field-hint text-center tnum" aria-live="polite">
          {expired ? "תוקף הקוד הסתיים. אפשר לבקש קוד חדש." : `הקוד תקף עוד ${clock(codeExpiresAt - now)} דקות.`}
        </p>
      </div>
      <Feedback error={error} />
      <button type="submit" className="btn-violet btn-block" disabled={busy || expired || code.length !== 6}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {busy ? "בודקת…" : submitLabel}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <button type="button" className="btn-text tnum" disabled={busy || resendIn > 0} onClick={() => void resend()}>
          {resendIn > 0 ? `קוד חדש בעוד ${clock(resendIn)}` : "שליחת קוד חדש"}
        </button>
        {onChangeEmail && (
          <button type="button" className="btn-text text-white/60" disabled={busy} onClick={onChangeEmail}>
            {changeEmailLabel}
          </button>
        )}
      </div>
      <p className="t-foot text-center">לא מוצאת את המייל? כדאי להציץ גם בספאם או בקידומי מכירות.</p>
    </form>
  );
}
