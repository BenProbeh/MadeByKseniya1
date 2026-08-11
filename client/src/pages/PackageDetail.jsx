import { useParams, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PACKAGE_DETAILS } from "../lib/packageData.js";

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
        className="text-center mb-10"
      >
        <span className="section-eyebrow justify-center">{pkg.eyebrow}</span>
        <h1 className="font-serif text-3xl md:text-5xl text-white mt-3">{pkg.title}</h1>
        <p className="font-serif text-white/60 text-lg mt-4 max-w-xl mx-auto">{pkg.subtitle}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel p-6 md:p-10 space-y-4"
      >
        {pkg.sizes.map((s) => (
          <Link
            key={s.label}
            to="/booking"
            state={{ prefillNotes: `בקשה: ${pkg.title} - מידה ${s.label}` }}
            className="group flex items-center justify-between border-b border-white/[0.08] last:border-b-0 pb-4 last:pb-0 hover:text-violet-200 transition-colors"
          >
            <span className="font-serif text-2xl">{s.label}</span>
            <span className="font-serif text-xl violet-text flex items-center gap-2">
              {s.price}
              <span className="btn-text-arrow opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                ←
              </span>
            </span>
          </Link>
        ))}
      </motion.div>

      <p className="font-serif text-center text-white/70 text-lg mt-8">{pkg.note}</p>

      <div className="text-center mt-10">
        <Link to="/booking" state={{ prefillNotes: `בקשה: ${pkg.title}` }} className="btn-violet">
          קביעת תור
        </Link>
      </div>
    </div>
  );
}
