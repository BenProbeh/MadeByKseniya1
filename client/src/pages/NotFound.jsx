import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isStaff } from "../lib/roles.js";
import { isStaffArea } from "../lib/navigation.js";

/**
 * The address leads nowhere: a lit 404 board, one line on why, and the way home (the staff overview inside
 * the management area). `back` adds a second way out, e.g. to the packages from an unknown package.
 */
export default function NotFound({ back }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const home = isStaffArea(pathname) && isStaff(user) ? "/admin" : "/";

  useEffect(() => {
    const previous = document.title;
    document.title = "הדף לא נמצא · MadeByKseniya";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="max-w-sm mx-auto pt-[4vh] pb-6 flex flex-col items-center text-center gap-7">
      <div className="marquee-frame rounded-card shadow-glow w-full">
        <div className="marquee-frame__inner relative overflow-hidden px-6 py-8">
          <span className="marquee violet-text block text-[5.5rem] leading-none" aria-hidden="true">
            404
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <span className="section-eyebrow justify-center">Lost</span>
        <h1 className="text-[2rem] leading-tight">
          הדף לא <span className="violet-text">נמצא</span>
        </h1>
        <p className="t-sub max-w-xs mx-auto">ייתכן שהקישור ישן, או שנפלה בו טעות קטנה.</p>
      </div>
      <div className="w-full space-y-3">
        <Link to={home} className="btn-violet w-full">
          {home === "/admin" ? "לסקירה" : "לדף הבית"}
        </Link>
        {back && (
          <Link to={back.to} className="btn-ghost w-full">
            {back.label}
          </Link>
        )}
      </div>
    </div>
  );
}
