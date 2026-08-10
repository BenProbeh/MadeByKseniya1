import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

export default function ScrollCue({ label = "המשיכי לגלול" }) {
  const ref = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const scaleY = useTransform(scrollYProgress, [0, 0.5, 1], prefersReducedMotion ? [1, 1, 1] : [0.2, 1, 0.2]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], prefersReducedMotion ? [1, 1, 1] : [0.3, 1, 0.3]);

  return (
    <div ref={ref} className="relative flex flex-col items-center gap-5 py-16">
      <p className="text-[11px] tracking-[0.3em] uppercase text-white/35">{label}</p>
      <div className="relative w-px h-16 bg-white/10 overflow-hidden">
        <motion.div
          style={{ scaleY, opacity }}
          className="absolute inset-0 origin-top bg-gradient-to-b from-violet-300 to-violet-600"
        />
      </div>
    </div>
  );
}
