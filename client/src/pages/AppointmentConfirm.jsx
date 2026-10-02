import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { confirmBookingByToken } from "../lib/authApi.js";
import { apiErrorCode, getApiErrorMessage } from "../lib/authErrors.js";
import { formatCalendarDay } from "../lib/format.js";

const SUCCESS_TEXT = "ההזמנה אושרה בהצלחה. נתראה בתור שלך!";
const ALREADY_TEXT = "ההזמנה הזו כבר אושרה. נתראה בתור שלך!";

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
    <div className="max-w-md mx-auto px-6 py-12 md:py-16 space-y-6">
      <div className="flex flex-col items-center text-center overflow-visible">
        <img
          src="/logo.png"
          alt="MadeByKseniya"
          className="w-44 md:w-52 h-auto object-contain drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]"
        />
      </div>

      <section className="glass-panel p-6 md:p-8 text-center space-y-4 shadow-glow" aria-live="polite">
        {state.phase === "working" && (
          <>
            <h1 className="font-serif text-2xl text-white">אישור ההזמנה</h1>
            <p className="text-white/60 text-sm">רגע אחד, אני מאשרת את ההזמנה שלך…</p>
          </>
        )}

        {state.phase === "done" && (
          <>
            <div
              className="mx-auto h-14 w-14 rounded-full bg-violet-gradient text-oled-950 flex items-center justify-center text-2xl font-black"
              aria-hidden="true"
            >
              ✓
            </div>
            <h1 className="font-serif text-2xl md:text-3xl text-white leading-relaxed">
              {state.alreadyConfirmed ? ALREADY_TEXT : SUCCESS_TEXT}
            </h1>
            {appointment && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/75 space-y-1">
                <p className="text-white/90">{appointment.serviceLabel}</p>
                <p>
                  {formatCalendarDay(appointment.date)} · {appointment.time}
                  {appointment.priceIls != null && ` · ₪${appointment.priceIls}`}
                </p>
              </div>
            )}
          </>
        )}

        {state.phase === "error" && (
          <>
            <h1 className="font-serif text-2xl text-white">{ERROR_TITLES[state.code] || "לא הצלחתי לאשר את ההזמנה"}</h1>
            <p className="text-white/70 text-sm leading-relaxed" role="alert">
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
      </section>
    </div>
  );
}
