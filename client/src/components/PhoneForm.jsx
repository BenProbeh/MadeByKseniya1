import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { updatePhoneRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizePhone } from "../lib/phone.js";

export default function PhoneForm() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(!user?.phone);
  const [phone, setPhone] = useState(user?.phone || "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const check = normalizePhone(phone);
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
      setOk("מספר הטלפון נשמר.");
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשמור את מספר הטלפון. אפשר לנסות שוב."));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2 text-center sm:text-right">
        <p className="font-serif text-white/80">מספר טלפון</p>
        <p className="text-sm text-white/60">
          <span dir="ltr">{user?.phone}</span>
          <span className="text-white/40"> · {user?.phoneVerified ? "מאומת" : "לא מאומת"}</span>
        </p>
        {ok && (
          <p className="text-sm text-violet-200" role="status" aria-live="polite">
            {ok}
          </p>
        )}
        <button type="button" className="btn-text text-sm" onClick={() => setEditing(true)}>
          עדכון מספר
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1 text-center sm:text-right">
        <p className="font-serif text-white/80">{user?.phone ? "עדכון מספר טלפון" : "הוספת מספר טלפון"}</p>
        {!user?.phone && <p className="font-serif text-sm text-white/50">כדי שאוכל ליצור איתך קשר לגבי תורים.</p>}
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
          {busy ? "שומרת…" : "שמירת מספר"}
        </button>
        {user?.phone && (
          <button
            type="button"
            className="btn-text text-sm"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setPhone(user.phone);
              setTouched(false);
              setError("");
            }}
          >
            ביטול
          </button>
        )}
      </div>
    </form>
  );
}
