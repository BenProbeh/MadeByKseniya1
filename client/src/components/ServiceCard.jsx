import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function ServiceCard({ service, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="group glass-panel p-7 flex flex-col gap-4 hover:border-violet-400/30 transition-colors duration-500 ease-editorial"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg text-white">{service.name_he}</h3>
        <span className="shrink-0 text-[11px] tracking-wide font-medium text-violet-300/90 border border-violet-400/25 rounded-full px-3 py-1">
          {service.category}
        </span>
      </div>
      <p className="text-sm text-white/60 leading-relaxed">{service.description_he}</p>
      <div className="mt-auto flex items-center justify-between pt-5 border-t border-white/[0.08]">
        <div className="text-xs tracking-wide text-white/40">{service.duration_min} דק'</div>
        <div className="text-xl font-serif violet-text">{service.price_ils}₪</div>
      </div>
      <Link to="/booking" className="btn-text mt-1">
        <span>קביעת תור</span>
        <span className="btn-text-arrow opacity-0 group-hover:opacity-100 transition-opacity duration-500">←</span>
      </Link>
    </motion.div>
  );
}
