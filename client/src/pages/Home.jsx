import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ChevronLeft, Clock3, Images, MapPin, Palette, Ruler, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchMyAppointments } from "../lib/api.js";
import { fetchProfileMeasurements } from "../lib/authApi.js";
import { formatCalendarDay } from "../lib/format.js";
import { israelToday, nextStep } from "../lib/nextStep.js";
import { STUDIO_WAZE_URL, openStudioInWaze } from "../lib/studioAddress.js";
import { PACKAGES } from "../lib/packages.js";
import { ConfirmBookingButton } from "../components/profile/ProfileSections.jsx";
import AppointmentStatusBadge from "../components/AppointmentStatusBadge.jsx";

function greeting(name) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(new Date()));
  const part = hour < 5 ? "לילה טוב" : hour < 12 ? "בוקר טוב" : hour < 18 ? "צהריים טובים" : "ערב טוב";
  return name ? `${part}, ${name}` : part;
}

function When({ appointment }) {
  return (
    <p className="flex items-center gap-2 text-sub text-white/80">
      <Clock3 size={17} strokeWidth={1.9} className="text-violet-300 shrink-0" aria-hidden="true" />
      <span>
        {formatCalendarDay(appointment.date)} · <span className="tnum">{appointment.time}</span>
      </span>
    </p>
  );
}

/** The one card that answers "what now?". */
function NextStepCard({ step, onConfirmed }) {
  if (!step) {
    return (
      <div className="card p-5 space-y-4" aria-hidden="true">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-4 w-60" />
        <div className="skeleton h-12 w-full rounded-full" />
      </div>
    );
  }

  const a = step.appointment;
  const shell = "card-raised p-5 space-y-4 relative overflow-hidden";
  const glow = (
    <span
      className="pointer-events-none absolute -top-24 -start-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl"
      aria-hidden="true"
    />
  );

  if (step.kind === "confirm") {
    return (
      <section className={shell} aria-labelledby="next-title">
        {glow}
        <AppointmentStatusBadge status={a.status} />
        <div className="space-y-1.5">
          <h2 id="next-title" className="t-title">התור שלך אושר</h2>
          <p className="t-sub">נשאר רק לאשר את ההזמנה, ואז השעה שמורה לך.</p>
        </div>
        <When appointment={a} />
        <ConfirmBookingButton appointment={a} onConfirmed={onConfirmed} block />
      </section>
    );
  }

  if (step.kind === "visit") {
    return (
      <section className={shell} aria-labelledby="next-title">
        {glow}
        <AppointmentStatusBadge status={a.status} />
        <div className="space-y-1.5">
          <h2 id="next-title" className="t-title">נתראה בקרוב</h2>
          <p className="t-sub">{a.serviceLabel}</p>
        </div>
        <When appointment={a} />
        <a
          href={STUDIO_WAZE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openStudioInWaze();
          }}
          className="btn-ghost btn-block"
        >
          <MapPin size={18} strokeWidth={1.9} aria-hidden="true" />
          ניווט לסטודיו
        </a>
      </section>
    );
  }

  if (step.kind === "pending") {
    return (
      <section className={shell} aria-labelledby="next-title">
        {glow}
        <AppointmentStatusBadge status={a.status} />
        <div className="space-y-1.5">
          <h2 id="next-title" className="t-title">הבקשה שלך אצלי</h2>
          <p className="t-sub">אני עוברת עליה ואעדכן אותך במייל ברגע שהתור מאושר.</p>
        </div>
        <When appointment={a} />
        <Link to="/appointments" className="btn-ghost btn-block">
          לכל התורים שלי
        </Link>
      </section>
    );
  }

  if (step.kind === "measure") {
    return (
      <section className={shell} aria-labelledby="next-title">
        {glow}
        <span className="grid place-items-center w-12 h-12 rounded-full bg-violet-400/15 text-violet-200" aria-hidden="true">
          <Ruler size={24} strokeWidth={1.8} />
        </span>
        <div className="space-y-1.5">
          <h2 id="next-title" className="t-title">נתחיל מהמידות שלך</h2>
          <p className="t-sub">כמה דקות עם הטלפון ומטבע של 10 ₪, והסט הבא שלך יתאים בדיוק.</p>
        </div>
        <Link to="/nail-sizing" className="btn-violet btn-block">
          למדידה
        </Link>
      </section>
    );
  }

  return (
    <section className={shell} aria-labelledby="next-title">
      {glow}
      <span className="grid place-items-center w-12 h-12 rounded-full bg-violet-400/15 text-violet-200" aria-hidden="true">
        <CalendarPlus size={24} strokeWidth={1.8} />
      </span>
      <div className="space-y-1.5">
        <h2 id="next-title" className="t-title">מתי נתראה?</h2>
        <p className="t-sub">המידות שלך שמורות. בוחרות מסלול ושעה, ואני מאשרת.</p>
      </div>
      <Link to="/booking" className="btn-violet btn-block">
        קביעת תור
      </Link>
    </section>
  );
}

function ExploreRow({ to, icon: Icon, title, text }) {
  return (
    <Link to={to} className="list-row">
      <span className="grid place-items-center w-10 h-10 rounded-full bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block t-headline">{title}</span>
        <span className="block t-foot mt-0.5">{text}</span>
      </span>
      <ChevronLeft size={20} className="text-white/30 shrink-0" aria-hidden="true" />
    </Link>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState(undefined);
  const [hasMeasurements, setHasMeasurements] = useState(undefined);

  useEffect(() => {
    let active = true;
    fetchMyAppointments()
      .then((list) => active && setAppointments(list))
      .catch(() => active && setAppointments([]));
    fetchProfileMeasurements()
      .then((m) => active && setHasMeasurements(Boolean(m)))
      .catch(() => active && setHasMeasurements(false));
    return () => {
      active = false;
    };
  }, []);

  const ready = appointments !== undefined && hasMeasurements !== undefined;
  const step = ready ? nextStep({ appointments, hasMeasurements, today: israelToday() }) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pt-2">
      <header>
        <p className="t-sub">{greeting(user?.firstName)}</p>
        <h1 className="t-large-title mt-0.5">מה עושות היום?</h1>
      </header>

      <NextStepCard
        step={step}
        onConfirmed={(updated) => setAppointments((list) => (list || []).map((a) => (a.id === updated.id ? updated : a)))}
      />

      <section aria-labelledby="packages-title" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="packages-title" className="t-title">המסלולים</h2>
          <Link to="/services" className="btn-text">
            לכל המסלולים
          </Link>
        </div>
        <ul className="chip-scroller gap-3 snap-x">
          {PACKAGES.map((p) => (
            <li key={p.slug} className="w-[72%] max-w-[17rem]">
              <Link
                to={`/services/${p.slug}`}
                className={`card flex flex-col justify-between h-40 p-5 transition-colors active:bg-oled-800 ${
                  p.featured ? "border-violet-400/40" : ""
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="t-foot">{p.tagline}</span>
                  {p.featured && <Sparkles size={18} className="text-violet-300" aria-label="הכי פופולרי" />}
                </span>
                <span>
                  <span className="block font-brand text-[0.9375rem] leading-snug tracking-wide text-white break-words">{p.title}</span>
                  <span className="block t-foot mt-1">
                    החל מ־<span className="tnum">{p.fromPrice}</span> ₪
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="explore-title" className="space-y-3">
        <h2 id="explore-title" className="t-title">השראה</h2>
        <div className="list-group">
          <ExploreRow to="/build-a-set" icon={Palette} title="עצבי סט" text="צבע, צורה ואורך — וראי את המחיר" />
          <ExploreRow to="/gallery" icon={Images} title="גלריה" text="עבודות אחרונות מהסטודיו" />
        </div>
      </section>
    </div>
  );
}
