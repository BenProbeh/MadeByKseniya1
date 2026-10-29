import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import TextField from "./ui/TextField.jsx";
import { updatePhoneRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizePhone } from "../lib/phone.js";

/** Optional contact phone — never used for signing in or verification. Lives in a sheet; `onDone(message)` closes it. */
export default function PhoneForm({ onDone, onCancel }) {
  const { user, updateUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clearing = !phone.trim();
  const check = clearing ? { ok: true, e164: null } : normalizePhone(phone);
  const fieldError = touched && !check.ok ? check.error : "";

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setTouched(true);
    setError("");
    if (!check.ok) return;
    setBusy(true);
    try {
      const next = await updatePhoneRequest(check.e164);
      updateUser(next);
      onDone?.(next.phone ? "מספר הטלפון נשמר." : "מספר הטלפון הוסר.");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשמור את מספר הטלפון. אפשר לנסות שוב."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label="טלפון נייד"
        type="tel"
        name="tel"
        autoComplete="tel"
        inputMode="tel"
        ltr
        placeholder="050-1234567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onBlur={() => setTouched(Boolean(phone.trim()) || touched)}
        error={fieldError}
        hint="לא חובה. ההתחברות והעדכונים על התורים עוברים במייל."
        maxLength={20}
      />
      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className={clearing && user?.phone ? "btn-danger" : "btn-violet"} disabled={busy}>
          {busy ? "שומרת…" : clearing && user?.phone ? "הסרת המספר" : "שמירה"}
        </button>
      </div>
    </form>
  );
}
