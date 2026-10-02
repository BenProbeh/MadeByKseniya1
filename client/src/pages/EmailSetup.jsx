import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import CodeStep, { AUTH_INPUT_CLASS, Feedback } from "../components/auth/CodeStep.jsx";
import { confirmEmailChangeRequest, startEmailChangeRequest } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";
import { safeInternalPath } from "../lib/authPaths.js";
import { skipEmailSetupForNow } from "../lib/emailSetupGate.js";

/**
 * Accounts from before email sign-in add their address here once (ProtectedRoute sends them);
 * verified accounts use the same screen to change their address.
 */
export default function EmailSetup() {
  const { user, authenticated, loading, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeInternalPath(location.state?.from);
  const changing = Boolean(user?.emailVerified);

  const [emailInput, setEmailInput] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="font-serif text-white/60 text-sm">רגע אחד…</p>
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  async function sendCode(e) {
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
      const data = await startEmailChangeRequest(checked.email);
      const start = Date.now();
      setSent({
        email: data.email,
        expiresAt: start + 600 * 1000,
        resendAt: start + data.resendAfterSeconds * 1000,
        info: "שלחתי קוד אימות לכתובת החדשה. הקוד תקף ל־10 דקות.",
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשלוח קוד כרגע. אפשר לנסות שוב בעוד רגע."));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(code) {
    const next = await confirmEmailChangeRequest({ email: sent.email, code });
    updateUser(next);
    navigate(changing ? "/profile" : from, { replace: true, state: { emailUpdated: true } });
  }

  async function resend() {
    const data = await startEmailChangeRequest(sent.email);
    return { ...data, expiresInSeconds: 600 };
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <div className="flex flex-col items-center text-center overflow-visible">
        <img
          src="/logo.png"
          alt="MadeByKseniya"
          className="w-44 md:w-52 h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
        />
        <h1 className="font-serif text-2xl text-white mt-4">
          {changing ? "שינוי כתובת האימייל" : "עוד צעד קטן"}
        </h1>
        <p className="font-serif text-sm text-white/60 mt-2">
          {changing
            ? "אשלח קוד לכתובת החדשה. עד שתאשרי אותה, הכתובת הנוכחית נשארת בתוקף."
            : `היי ${user?.firstName || ""}, מעכשיו ההתחברות והעדכונים על התורים עוברים במייל. נשאר רק להוסיף ולאמת את כתובת האימייל שלך.`}
        </p>
      </div>

      {sent ? (
        <CodeStep
          key={sent.email}
          email={sent.email}
          expiresAt={sent.expiresAt}
          resendAt={sent.resendAt}
          info={sent.info}
          submitLabel="אימות הכתובת"
          onSubmit={submitCode}
          onResend={resend}
          onChangeEmail={() => setSent(null)}
          changeEmailLabel="כתובת אחרת"
        />
      ) : (
        <form onSubmit={sendCode} className="glass-panel p-6 md:p-8 space-y-5" noValidate>
          {changing && (
            <p className="text-sm text-white/60 text-center">
              הכתובת הנוכחית:{" "}
              <bdi dir="ltr" className="text-white/85 break-all">
                {user.email}
              </bdi>
            </p>
          )}
          <label className="block space-y-2 text-sm text-white/70" htmlFor="setup-email">
            <span>{changing ? "כתובת אימייל חדשה" : "אימייל"}</span>
            <input
              id="setup-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              placeholder="name@example.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (error) setError("");
              }}
              className={`${AUTH_INPUT_CLASS} text-right`}
              maxLength={254}
              required
            />
          </label>
          <Feedback error={error} />
          <button type="submit" className="btn-violet w-full" disabled={busy}>
            {busy ? "שולחת…" : "שליחת קוד אימות"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        {changing ? (
          <Link to="/profile" className="text-violet-200 hover:text-violet-100">
            חזרה לפרופיל
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="text-white/55 hover:text-white"
              onClick={() => {
                skipEmailSetupForNow(user.id);
                navigate(from, { replace: true });
              }}
            >
              אחר כך
            </button>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => void logout()}>
              התנתקות
            </button>
          </>
        )}
      </div>
    </div>
  );
}
