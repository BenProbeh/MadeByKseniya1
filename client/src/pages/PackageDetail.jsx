import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PACKAGE_DETAILS } from "../lib/packageData.js";
import Ils from "../components/Ils.jsx";

function OptionBlock({ option, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <div className="text-center space-y-2">
        <h2 className="font-serif text-2xl md:text-3xl text-white">{option.name}</h2>
        <p className="font-serif text-white/60 max-w-xl mx-auto">{option.subtitle}</p>
      </div>

      <div className="glass-panel p-6 md:p-8 space-y-4">
        {option.sizes ? (
          option.sizes.map((s) => (
            <Link
              key={s.label}
              to="/booking"
              state={{ prefillNotes: `בקשה: ${option.name} - מידה ${s.label}` }}
              className="group flex items-center justify-between gap-4 border-b border-white/[0.08] last:border-b-0 pb-4 last:pb-0 hover:text-violet-200 transition-colors"
            >
              <span className="font-serif text-2xl flex items-baseline gap-2 min-w-0">
                <span className="shrink-0">{s.label}</span>
                {s.detail && (
                  <span className="text-sm text-white/50 font-normal">{s.detail}</span>
                )}
              </span>
              <span className="font-serif text-xl violet-text flex items-center gap-2 shrink-0">
                <span>
                  {s.price}
                  <Ils />
                </span>
                <span className="btn-text-arrow opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  ←
                </span>
              </span>
            </Link>
          ))
        ) : (
          <Link
            to="/booking"
            state={{ prefillNotes: `בקשה: ${option.name}` }}
            className="group flex items-center justify-center gap-2 hover:text-violet-200 transition-colors"
          >
            <span className="font-serif text-2xl violet-text">
              {option.price}
              <Ils />
            </span>
            <span className="btn-text-arrow opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-violet-300">
              ←
            </span>
          </Link>
        )}
      </div>

      {option.note && <p className="font-serif text-center text-white/70">{option.note}</p>}
    </motion.div>
  );
}

export default function PackageDetail() {
  const { slug } = useParams();
  const pkg = PACKAGE_DETAILS[slug];

  if (!pkg) return <Navigate to="/services" replace />;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/services" className="btn-text mb-10 inline-flex">
        <span className="btn-text-arrow">→</span>
        <span>חזרה למסלולים</span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-12"
      >
        <span className="section-eyebrow justify-center">{pkg.eyebrow}</span>
        <h1 className="font-serif text-3xl md:text-5xl text-white mt-3">{pkg.title}</h1>
      </motion.div>

      <div className="space-y-14">
        {pkg.options.map((option, i) => (
          <OptionBlock key={option.name} option={option} index={i} />
        ))}
      </div>

      <div className="text-center mt-14">
        <Link to="/booking" state={{ prefillNotes: `בקשה: ${pkg.title}` }} className="btn-violet">
          קביעת תור
        </Link>
      </div>
    </div>
  );
}
