import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const details = ["בוטיק פרטי בהזמנה מראש", "חומרים פרימיום מהעולם", "מאז 2019"];

function FrameCorner({ className }) {
  return <span className={`absolute w-6 h-6 border-violet-400/50 ${className}`} />;
}

/**
 * Atelier presentation frame — an intentionally large, gallery-style
 * placeholder slot. Swap the gradient fill for a real studio photograph
 * (portrait orientation, ~4:5) when photography is available; the frame,
 * corner marks and caption are designed to hold a photo exactly as-is.
 */
function AtelierFrame() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-sm mx-auto lg:mx-0 aspect-[4/5]"
    >
      <div className="absolute inset-0 rounded-sm overflow-hidden border border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_30%_10%,#28173d_0%,#0a0714_55%,#040308_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_85%,rgba(176,38,255,0.32),transparent_55%)]" />
        <svg
          viewBox="0 0 200 240"
          className="absolute inset-0 w-full h-full opacity-60"
          fill="none"
          stroke="url(#violetStroke)"
          strokeWidth="1"
        >
          <defs>
            <linearGradient id="violetStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d17dff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#7a00bf" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <path d="M100 40 C130 70 138 120 100 190 C62 120 70 70 100 40 Z" />
          <path d="M100 60 C120 82 126 118 100 168" strokeOpacity="0.5" />
        </svg>
      </div>

      <FrameCorner className="top-3 right-3 border-t border-r" />
      <FrameCorner className="top-3 left-3 border-t border-l" />
      <FrameCorner className="bottom-3 right-3 border-b border-r" />
      <FrameCorner className="bottom-3 left-3 border-b border-l" />

      <div className="absolute bottom-6 inset-x-6 flex items-center justify-between text-[11px] tracking-[0.25em] uppercase text-white/50">
        <span>01</span>
        <span>Atelier</span>
      </div>
    </motion.div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-24 md:pt-44 md:pb-32">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(176,38,255,0.20),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-oled-950 to-transparent" />
      </div>

      <div className="max-w-content mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
        <div className="text-center lg:text-right flex flex-col items-center lg:items-end gap-7">
          <motion.span
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="section-eyebrow"
          >
            Premium Nail Atelier
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif font-medium text-display-lg text-white max-w-2xl"
          >
            ציפורניים שמדברות
            <br />
            <span className="violet-text">בשפה של יוקרה</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="text-white/60 text-base md:text-lg max-w-xl leading-relaxed"
          >
            MadeByKseniya הוא סטודיו בוטיק לציפורניים — מניקור ג'ל, בניה, פדיקור ספא ועיצובים
            בהתאמה אישית. חוויה פרימיום מרגע שקבעת תור ועד הברק האחרון.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center justify-center lg:justify-end gap-x-8 gap-y-4 mt-2"
          >
            <Link to="/booking" className="btn-violet">
              קביעת תור עכשיו
            </Link>
            <Link to="/services" className="btn-text">
              <span>לצפייה בשירותים</span>
              <span className="btn-text-arrow">←</span>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="flex flex-wrap items-center justify-center lg:justify-end gap-x-5 gap-y-2 mt-4 text-[11px] tracking-[0.2em] uppercase text-white/35"
          >
            {details.map((d, i) => (
              <span key={d} className="flex items-center gap-5">
                {d}
                {i < details.length - 1 && <span className="w-1 h-1 rounded-full bg-violet-400/40" />}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="hidden lg:block">
          <AtelierFrame />
        </div>
      </div>
    </section>
  );
}
