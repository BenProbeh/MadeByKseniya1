import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { updateBookingEmailsRequest } from "../../lib/authApi.js";
import { getApiErrorMessage } from "../../lib/authErrors.js";
import { isStaff } from "../../lib/roles.js";

/** Sign-in email, plus the owner/admin choice to get an email for every new booking request. */
export default function EmailSection() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleBookingEmails(next) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      updateUser(await updateBookingEmailsRequest(next));
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשמור את ההגדרה. אפשר לנסות שוב."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-center sm:text-right">
      <p className="font-serif text-white/80">אימייל</p>
      {user?.emailVerified ? (
        <p className="text-sm text-white/60">
          <bdi dir="ltr" className="break-all">
            {user.email}
          </bdi>
          <span className="text-white/40"> · מאומת</span>
        </p>
      ) : (
        <p className="text-sm text-amber-200">עדיין אין כתובת אימייל מאומתת בחשבון. בלעדיה אי אפשר לשלוח בקשה לתור.</p>
      )}
      <Link to="/account/email" className="btn-text text-sm inline-block">
        {user?.emailVerified ? "שינוי כתובת" : "הוספת כתובת אימייל"}
      </Link>

      {isStaff(user) && user?.emailVerified && (
        <label className="flex items-center justify-center sm:justify-start gap-3 text-sm text-white/65 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={Boolean(user.notifyBookingEmails)}
            disabled={busy}
            onChange={(e) => void toggleBookingEmails(e.target.checked)}
            className="rounded border-white/30"
          />
          <span>לשלוח לי מייל על כל בקשה חדשה לתור</span>
        </label>
      )}
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
