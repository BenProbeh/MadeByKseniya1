import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import CodeStep, { Feedback } from "../components/auth/CodeStep.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
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
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loading) return null;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  async function sendCode(e) {
    e.preventDefault();
    if (busy) return;
    const checked = normalizeEmail(emailInput);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (changing && !password) {
      setError("כדי להחליף כתובת צריך להקליד את הסיסמה הנוכחית.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await startEmailChangeRequest(checked.email, changing ? password : undefined);
      setPassword("");
      const start = Date.now();
      setSent({
        email: data.email,
        expiresAt: start + 600 * 1000,
        resendAt: start + data.resendAfterSeconds * 1000,
        info: "שלחתי קוד אימות לכתובת החדשה. הקוד תקף ל־10 דקות.",
        password: changing ? password : undefined,
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
    const data = await startEmailChangeRequest(sent.email, sent.password);
    return { ...data, expiresInSeconds: 600 };
  }

  return (
    <AuthLayout
      compactLogo
      back={changing ? "/profile" : undefined}
      eyebrow="Email"
      title={changing ? "החלפת" : "עוד צעד"}
      accent={changing ? "אימייל" : "קטן"}
      subtitle={
        changing
          ? "אשלח קוד לכתובת החדשה. עד שתאשרי אותה, הכתובת הנוכחית נשארת בתוקף."
          : `היי ${user?.firstName || ""}, מעכשיו ההתחברות והעדכונים על התורים עוברים במייל. נשאר להוסיף ולאמת את הכתובת שלך.`
      }
      footer={
        !changing && (
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              className="btn-text text-white/60"
              onClick={() => {
                skipEmailSetupForNow(user.id);
                navigate(from, { replace: true });
              }}
            >
              אחר כך
            </button>
            <button type="button" className="btn-text text-white/60" onClick={() => void logout()}>
              התנתקות
            </button>
          </div>
        )
      }
    >
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
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          {changing && (
            <p className="t-sub">
              הכתובת הנוכחית:{" "}
              <bdi dir="ltr" className="text-white break-all">
                {user.email}
              </bdi>
            </p>
          )}
          <TextField
            label={changing ? "כתובת חדשה" : "אימייל"}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            ltr
            placeholder="name@example.com"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              if (error) setError("");
            }}
            maxLength={254}
          />
          {changing && (
            <TextField
              label="הסיסמה הנוכחית"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              ltr
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="ככה אני יודעת שזו באמת את."
              trailing={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
            />
          )}
          <Feedback error={error} />
          <button type="submit" className="btn-violet btn-block" disabled={busy}>
            {busy ? "שולחת…" : "שליחת קוד אימות"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
