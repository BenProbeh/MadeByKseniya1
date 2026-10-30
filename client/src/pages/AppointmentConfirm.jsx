import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { confirmBookingByToken } from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage } from "../lib/authErrors.js";
import { formatCalendarDay } from "../lib/format.js";

const SUCCESS_TEXT = "ההזמנה אושרה בהצלחה.";
const ALREADY_TEXT = "ההזמנה הזו כבר אושרה.";

const ERROR_TITLES = {
  CONFIRM_EXPIRED: "פג התוקף של הקישור",
  CONFIRM_UNAVAILABLE: "התור כבר לא פעיל",
};

function readLink() {
  const params = new URLSearchParams(window.location.search);
  return { id: Number(params.get("id")), token: params.get("token") || "" };
}

/** The "אישור ההזמנה" button from the approval email. */
export default function AppointmentConfirm() {
  const { authenticated } = useAuth();
  const [link] = useState(readLink);
  const [state, setState] = useState({ phase: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The token is single-use, but it still shouldn't linger in the address bar or history.
    if (window.location.search) window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!Number.isInteger(link.id) || link.id <= 0 || !link.token) {
      setState({ phase: "error", code: "CONFIRM_INVALID", message: "הקישור לא שלם. אפשר לפתוח שוב את הכפתור מהמייל, או לכתוב לי ואסדר את זה." });
      return;
    }
    confirmBookingByToken(link.id, link.token)
      .then(({ alreadyConfirmed, appointment }) => setState({ phase: "done", alreadyConfirmed, appointment }))
      .catch((err) =>
        setState({
          phase: "error",
          code: apiErrorCode(err),
          message: getApiErrorMessage(err, "לא הצלחתי לאשר את ההזמנה כרגע. אפשר לנסות שוב בעוד רגע."),
        })
      );
  }, [link]);

  const appointment = state.appointment;

  return (
    <div className="max-w-md mx-auto pt-6 space-y-6">
      <div className="flex flex-col items-center text-center">
        <div className="auth-stage">
          <img src="/logo.png" alt="MadeByKseniya" className="h-24 w-auto object-contain" />
        </div>
      </div>

      <section className="marquee-frame rounded-card shadow-glow" aria-live="polite">
        <div className="marquee-frame__inner relative overflow-hidden p-6 md:p-8 text-center space-y-4">
          {state.phase === "working" && (
            <>
              <span className="section-eyebrow justify-center">Confirm</span>
              <h1 className="text-[1.75rem] leading-tight">
                אישור <span className="violet-text">ההזמנה</span>
              </h1>
              <p className="t-sub">רגע אחד, אני מאשרת את ההזמנה שלך…</p>
            </>
          )}

          {state.phase === "done" && (
            <>
              <span className="mx-auto grid place-items-center h-14 w-14 rounded-full bg-violet-gradient shadow-glow" style={{ color: "#000" }} aria-hidden="true">
                <Check size={28} strokeWidth={2.5} />
              </span>
              <span className="section-eyebrow justify-center">Confirmed</span>
              <h1 className="text-[1.75rem] leading-tight">
                נתראה בתור <span className="violet-text">שלך</span>
              </h1>
              <p className="t-sub">{state.alreadyConfirmed ? ALREADY_TEXT : SUCCESS_TEXT}</p>
              {appointment && (
                <div className="rounded-control border border-violet-400/30 bg-violet-400/[0.06] p-4 space-y-1">
                  <p className="t-headline">{appointment.serviceLabel}</p>
                  <p className="t-sub">
                    {formatCalendarDay(appointment.date)} · <span className="tnum">{appointment.time}</span>
                  </p>
                  {appointment.priceIls != null && <p className="price text-xl pt-1">{appointment.priceIls} ₪</p>}
                </div>
              )}
            </>
          )}

          {state.phase === "error" && (
            <>
              <span className="section-eyebrow justify-center">Confirm</span>
              <h1 className="text-[1.75rem] leading-tight">{ERROR_TITLES[state.code] || "לא הצלחתי לאשר את ההזמנה"}</h1>
              <p className="t-sub leading-relaxed" role="alert">
                {state.message}
              </p>
            </>
          )}

          {state.phase !== "working" && (
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <Link to={authenticated ? "/profile" : "/login"} state={{ from: "/profile" }} className="btn-violet">
                {authenticated ? "לתורים שלי" : "להתחברות"}
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
