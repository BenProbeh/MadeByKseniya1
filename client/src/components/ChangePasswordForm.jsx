import { useState } from "react";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle.jsx";
import TextField from "./ui/TextField.jsx";
import { changePasswordRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";

function PasswordField({ label, name, autoComplete, value, onChange, error, hint }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label}
      type={visible ? "text" : "password"}
      name={name}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      ltr
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={128}
      error={error}
      hint={hint}
      trailing={<PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} />}
    />
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

/** Change password (own account only; the server enforces it). Lives in a sheet; `onDone(message)` closes it. */
export default function ChangePasswordForm({ onDone, onCancel }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const problem = validate({ currentPassword, newPassword, confirmPassword });
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await changePasswordRequest({ currentPassword, newPassword, confirmPassword });
      onDone?.(data?.message || "הסיסמה עודכנה.");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לעדכן את הסיסמה כרגע. אפשר לנסות שוב בעוד רגע."));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <PasswordField label="סיסמה נוכחית" name="current-password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
      <PasswordField
        label="סיסמה חדשה"
        name="new-password"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        hint="לפחות 8 תווים. אחרי השינוי, מכשירים אחרים שמחוברים יתנתקו."
      />
      <PasswordField
        label="שוב, לאימות"
        name="confirm-new-password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={mismatch ? "הסיסמאות עדיין לא תואמות." : ""}
      />
      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" className="btn-ghost" disabled={submitting} onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-violet" disabled={submitting}>
          {submitting ? "מעדכנת…" : "עדכון"}
        </button>
      </div>
    </form>
  );
}
