import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
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

const ease = [0.22, 1, 0.36, 1];

/**
 * Full-height app screen for sign-in, sign-up and verification, in the Neon Marquee look: the logo under a soft
 * stage light, a Sekuya eyebrow, a headline with one word in violet light, and the form on Cursor-era glass.
 * `back` shows a back button (to a path, or history). `accent` is the lit word appended to `title`.
 */
export default function AuthLayout({ eyebrow, title, accent, subtitle, children, footer, back, compactLogo = false }) {
  const navigate = useNavigate();
  const still = useReducedMotion();
  const enter = (delay, y = 16) => (still ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease } });
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
      <header className={`flex flex-col items-center text-center ${compactLogo ? "pt-0" : "pt-[3vh]"}`}>
        <motion.div {...(still ? {} : { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.7, ease } })} className="auth-stage">
          <Logo className={compactLogo ? "h-16 w-auto" : "h-28 w-auto"} />
        </motion.div>
        <motion.div {...enter(0.08)} className="mt-6 space-y-2">
          {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
          <h1 className="text-[2rem] leading-tight">
            {title}
            {accent && (
              <>
                {" "}
                <span className="violet-text">{accent}</span>
              </>
            )}
          </h1>
          {subtitle && <p className="t-sub max-w-xs mx-auto">{subtitle}</p>}
        </motion.div>
      </header>
      <motion.main {...enter(0.16, 20)} className="mt-7 flex-1">
        <div className="card p-5 sm:p-6">{children}</div>
      </motion.main>
      {footer && <footer className="pt-7 text-center text-sub text-white/65">{footer}</footer>}
    </div>
  );
}
