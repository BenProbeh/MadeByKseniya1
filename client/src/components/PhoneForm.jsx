import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { updatePhoneRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizePhone } from "../lib/phone.js";

/** Optional contact phone — never used for signing in or verification. */
export default function PhoneForm() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const clearing = !phone.trim();
  const check = clearing ? { ok: true, e164: null } : normalizePhone(phone);
  const fieldError = touched && !check.ok ? check.error : "";

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setTouched(true);
    setError("");
    setOk("");
    if (!check.ok) return;
    setBusy(true);
    try {
      const next = await updatePhoneRequest(check.e164);
      updateUser(next);
      setPhone(next.phone);
      setEditing(false);
      setOk(next.phone ? "מספר הטלפון נשמר." : "מספר הטלפון הוסר.");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשמור את מספר הטלפון. אפשר לנסות שוב."));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2 text-center sm:text-right">
        <p className="font-serif text-white/80">טלפון ליצירת קשר</p>
        <p className="text-sm text-white/60">
          {user?.phone ? <span dir="ltr">{user.phone}</span> : <span className="text-white/45">לא הוזן (אופציונלי)</span>}
        </p>
        {ok && (
          <p className="text-sm text-violet-200" role="status" aria-live="polite">
            {ok}
          </p>
        )}
        <button
          type="button"
          className="btn-text text-sm"
          onClick={() => {
            setPhone(user?.phone || "");
            setOk("");
            setEditing(true);
          }}
        >
          {user?.phone ? "עדכון מספר" : "הוספת מספר"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1 text-center sm:text-right">
        <p className="font-serif text-white/80">טלפון ליצירת קשר</p>
        <p className="font-serif text-sm text-white/50">אופציונלי. ההתחברות והעדכונים על התורים עוברים במייל.</p>
      </div>
      <label className="block space-y-2 text-sm text-white/70">
        <span>מספר טלפון נייד</span>
        <input
          type="tel"
          name="tel"
          autoComplete="tel"
          inputMode="tel"
          dir="ltr"
          placeholder="050-1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setTouched(Boolean(phone.trim()) || touched)}
          aria-invalid={Boolean(fieldError)}
          maxLength={20}
          className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-base text-right outline-none focus:border-violet-400/60 ${
            fieldError ? "border-amber-300/60" : "border-white/10"
          }`}
        />
        {fieldError && (
          <span className="block text-xs text-amber-200" aria-live="polite">
            {fieldError}
          </span>
        )}
      </label>
      {error && (
        <p className="text-sm text-red-300 text-center sm:text-right" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
        <button type="submit" className="btn-violet" disabled={busy}>
          {busy ? "שומרת…" : clearing && user?.phone ? "הסרת המספר" : "שמירת מספר"}
        </button>
        <button
          type="button"
          className="btn-text text-sm"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setPhone(user?.phone || "");
            setTouched(false);
            setError("");
          }}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
