import { useState } from "react";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle.jsx";
import { changePasswordRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";

const INPUT_CLASS =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60 pe-12";

function PasswordField({ label, name, autoComplete, value, onChange }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block space-y-2 text-sm text-white/70 text-right">
      <span>{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
          maxLength={128}
          required
        />
        <PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />
      </div>
    </label>
  );
}

function validate({ currentPassword, newPassword, confirmPassword }) {
  if (!currentPassword) return "יש להזין את הסיסמה הנוכחית.";
  if (newPassword.length < 8) return "הסיסמה החדשה חייבת להכיל לפחות 8 תווים.";
  if (newPassword.length > 128) return "הסיסמה החדשה ארוכה מדי.";
  if (newPassword !== confirmPassword) return "אימות הסיסמה החדשה אינו תואם.";
  if (newPassword === currentPassword) return "הסיסמה החדשה זהה לסיסמה הנוכחית.";
  return "";
}

export default function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSuccess("");
    const problem = validate({ currentPassword, newPassword, confirmPassword });
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await changePasswordRequest({ currentPassword, newPassword, confirmPassword });
      reset();
      setOpen(false);
      setSuccess(data?.message || "הסיסמה עודכנה.");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center sm:justify-start">
        <button
          type="button"
          className="btn-text text-sm"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            setSuccess("");
            reset();
          }}
        >
          שינוי סיסמה
          <span className="btn-text-arrow">{open ? "↑" : "←"}</span>
        </button>
      </div>

      {success && (
        <p className="text-sm text-violet-200 text-center sm:text-right" role="status" aria-live="polite">
          {success}
        </p>
      )}

      {open && (
        <form onSubmit={onSubmit} className="space-y-4 border border-white/[0.08] rounded-xl p-4 md:p-5" noValidate>
          <PasswordField
            label="סיסמה נוכחית"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            label="סיסמה חדשה"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <PasswordField
            label="אימות סיסמה חדשה"
            name="confirm-new-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          <p className="text-xs text-white/40 text-right">לפחות 8 תווים. אחרי השינוי, שאר המכשירים המחוברים יתנתקו.</p>
          {error && (
            <p className="text-sm text-red-300 text-center" role="alert" aria-live="assertive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
            <button type="submit" className="btn-violet" disabled={submitting}>
              {submitting ? "מעדכנת…" : "עדכון סיסמה"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={submitting}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              ביטול
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
