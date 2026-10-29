import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle.jsx";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { normalizeEmail } from "../lib/email.js";
import { safeInternalPath } from "../lib/authPaths.js";

/** Four fields: name, email, password. The username is created by the server; the code in the email activates the account. */
export default function Register() {
  const { register, authenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = safeInternalPath(location.state?.from);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authenticated && !submitting) return <Navigate to={from} replace />;

  const emailCheck = normalizeEmail(email);
  const fieldErrors = {
    firstName: firstName.trim().length < 2 ? "נשאר להקליד שם פרטי." : "",
    lastName: lastName.trim().length < 2 ? "נשאר להקליד שם משפחה." : "",
    email: !emailCheck.ok ? emailCheck.error : "",
    password: password.length < 8 ? "לפחות 8 תווים." : "",
  };
  const show = (name) => (touched[name] ? fieldErrors[name] : "");
  const touch = (name) => () => setTouched((t) => ({ ...t, [name]: true }));

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setTouched({ firstName: true, lastName: true, email: true, password: true });
    const firstInvalid = Object.keys(fieldErrors).find((k) => fieldErrors[k]);
    if (firstInvalid) {
      document.querySelector(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const pending = await register({ firstName, lastName, email: emailCheck.email, password, confirmPassword: password });
      if (pending.signedIn) {
        navigate(from, { replace: true });
        return;
      }
      const start = Date.now();
      setPassword("");
      navigate("/verify-email", {
        replace: true,
        state: {
          email: pending.email,
          expiresAt: start + pending.expiresInSeconds * 1000,
          resendAt: start + pending.resendAfterSeconds * 1000,
          rememberMe: true,
          from,
        },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי ליצור את החשבון כרגע. אפשר לנסות שוב בעוד רגע."));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      compactLogo
      back="/login"
      title="נעים להכיר"
      subtitle="כאן אשמור את המידות, התורים וכל מה שצריך לפעם הבאה."
      footer={
        <>
          כבר יש לך חשבון?{" "}
          <Link to="/login" state={{ from }} className="text-violet-300 font-medium inline-flex min-h-[2.75rem] items-center">
            להתחברות
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="שם פרטי"
            name="firstName"
            autoComplete="given-name"
            enterKeyHint="next"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={touch("firstName")}
            error={show("firstName")}
            maxLength={60}
          />
          <TextField
            label="שם משפחה"
            name="lastName"
            autoComplete="family-name"
            enterKeyHint="next"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={touch("lastName")}
            error={show("lastName")}
            maxLength={60}
          />
        </div>
        <TextField
          label="אימייל"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          ltr
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email.trim() && touch("email")()}
          error={show("email")}
          hint="אשלח לכאן קוד קצר להפעלת החשבון."
          maxLength={254}
        />
        <TextField
          label="סיסמה"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          ltr
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => password && touch("password")()}
          error={show("password")}
          hint="לפחות 8 תווים."
          maxLength={128}
          trailing={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />

        {error && (
          <p className="notice-error" role="alert">
            {String(error)}
          </p>
        )}

        <button type="submit" className="btn-violet btn-block" disabled={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? "יוצרת חשבון…" : "יצירת חשבון"}
        </button>
      </form>
    </AuthLayout>
  );
}
