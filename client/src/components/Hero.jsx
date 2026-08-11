import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";

const details = ["בוטיק פרטי בהזמנה מראש", "חומרים פרימיום מהעולם", "מאז 2019"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden min-h-screen flex items-center px-6 pt-28 pb-16 md:pt-24 md:pb-16">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(176,38,255,0.20),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-oled-950 to-transparent" />
      </div>

      <div className="max-w-content mx-auto flex flex-col items-center text-center gap-7">
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <Logo className="h-24 sm:h-32 md:h-40 lg:h-48 w-auto drop-shadow-[0_0_28px_rgba(176,38,255,0.55)]" />
        </motion.div>

        <motion.span
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="section-eyebrow"
        >
          Premium Nail Atelier
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif font-medium text-display-md text-white max-w-2xl"
        >
          ציפורניים שמדברות
          <br />
          <span className="violet-text">בשפה של יוקרה</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-white/60 text-base md:text-lg max-w-2xl leading-relaxed"
        >
          MadeByKseniya סטודיו לעיצוב ציפורניים, שיקום, ולראשונה בארץ ציפורניים בהזמנה אישית לפי
          טעמך! הכל נמצא במקום אחד, ביחד עם חומרי הגלם והאיכות שאני מביאה, החלטתי ללמד אתכן בנות
          את מה שאני יודעת. רוצות להתחיל קריירה בתחום? מה שנשאר לכן הוא להירשם לקורס שאני מעבירה,
          והדרך שלכן להצלחה בתחום זה רק עניין של כמה מפגשים💜
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.52, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 mt-2"
        >
          <Link to="/build-a-set" className="btn-violet">
            עצבי לעצמך
          </Link>
          <Link to="/booking" state={{ prefillNotes: "בקשה: קורס" }} className="btn-ghost">
            להרשמה לקורס
          </Link>
          <Link to="/services" className="btn-text">
            <span>לצפייה במסלולים</span>
            <span className="btn-text-arrow">←</span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-4 text-[11px] tracking-[0.2em] uppercase text-white/35"
        >
          {details.map((d, i) => (
            <span key={d} className="flex items-center gap-5">
              {d}
              {i < details.length - 1 && <span className="w-1 h-1 rounded-full bg-violet-400/40" />}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
