import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Info } from "lucide-react";
import Logo from "../Logo.jsx";
import api from "../../lib/api.js";

let mailModePromise = null;

/** "console" when the server runs the development email mode (codes go to the server log, not to inboxes). */
export function useMailMode() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    mailModePromise ??= api
      .get("/health")
      .then((r) => r.data?.mailProvider || null)
      .catch(() => null);
    let active = true;
    mailModePromise.then((m) => active && setMode(m));
    return () => {
      active = false;
    };
  }, []);
  return mode;
}

/** Shown wherever a code is "sent": in development nothing reaches an inbox, and the screen says so. */
export function DevMailNotice() {
  const mode = useMailMode();
  if (mode !== "console") return null;
  return (
    <p className="notice-info" role="note">
      <Info size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>מצב פיתוח: לא נשלח מייל אמיתי. הקוד מופיע ביומן השרת (server log).</span>
    </p>
  );
}

/**
 * Full-height app screen for sign-in, sign-up and verification: logo, a clear title, the form,
 * and the secondary link at the bottom. `back` shows a back button (to a path, or history).
 */
export default function AuthLayout({ title, subtitle, children, footer, back, compactLogo = false }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-sm min-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-2.5rem)] flex flex-col">
      <div className="h-11 -ms-2">
        {back && (
          <button
            type="button"
            className="icon-btn"
            aria-label="חזרה"
            onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          >
            <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <header className={`flex flex-col items-center text-center ${compactLogo ? "pt-1" : "pt-[4vh]"}`}>
        <Logo className={compactLogo ? "h-16 w-auto" : "h-28 w-auto"} />
        <h1 className="t-large-title mt-6">{title}</h1>
        {subtitle && <p className="t-sub mt-2 max-w-xs">{subtitle}</p>}
      </header>
      <main className="mt-8 flex-1">{children}</main>
      {footer && <footer className="pt-8 text-center text-sub text-white/60">{footer}</footer>}
    </div>
  );
}
