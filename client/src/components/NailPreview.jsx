import { motion, AnimatePresence } from "framer-motion";
import { findById, SHAPES, FINISHES, COLOURS } from "../lib/nailOptions.js";

const SHAPE_STYLE = {
  almond: { borderRadius: "50% 50% 45% 45% / 65% 65% 18% 18%" },
  square: { borderRadius: "12px 12px 6px 6px" },
  round: { borderRadius: "50% 50% 14% 14%" },
  coffin: {
    clipPath: "polygon(18% 0%, 82% 0%, 100% 92%, 100% 100%, 0% 100%, 0% 8%)",
  },
  stiletto: {
    clipPath: "polygon(50% 0%, 100% 62%, 100% 100%, 0% 100%, 0% 62%)",
  },
};

const FINGER_HEIGHTS = [0.8, 0.95, 1, 0.88, 0.7];

const GLITTER_DOTS = [
  "12% 20%",
  "68% 12%",
  "30% 45%",
  "80% 38%",
  "50% 60%",
  "18% 75%",
  "72% 70%",
  "45% 15%",
  "88% 85%",
  "8% 92%",
];

function getFinishBackground(hex, finishId) {
  if (finishId === "glossy") {
    return {
      backgroundColor: hex,
      backgroundImage: `linear-gradient(155deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.15) 22%, transparent 45%)`,
    };
  }
  if (finishId === "matte") {
    return {
      backgroundColor: hex,
      backgroundImage: `radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.12), transparent 70%)`,
    };
  }
  if (finishId === "chrome") {
    return {
      backgroundColor: hex,
      backgroundImage: `repeating-linear-gradient(100deg, rgba(255,255,255,0.9) 0%, rgba(180,180,190,0.3) 12%, rgba(255,255,255,0.9) 24%)`,
      backgroundSize: "200% 100%",
    };
  }
  if (finishId === "glitter") {
    const dots = GLITTER_DOTS.map(
      (pos) => `radial-gradient(circle at ${pos}, rgba(255,255,255,0.95) 0 1px, transparent 2px)`
    ).join(", ");
    return {
      backgroundColor: hex,
      backgroundImage: `${dots}, radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.35), transparent 60%)`,
    };
  }
  return { backgroundColor: hex };
}

export default function NailPreview({ shapeId, finishId, colourId, className = "" }) {
  const shape = findById(SHAPES, shapeId);
  const finish = findById(FINISHES, finishId);
  const colour = findById(COLOURS, colourId);
  const shapeStyle = SHAPE_STYLE[shape.id] ?? SHAPE_STYLE.almond;
  const finishStyle = getFinishBackground(colour.hex, finish.id);

  return (
    <div className={`glass-panel flex items-end justify-center gap-[3%] p-5 md:p-8 ${className}`}>
      {FINGER_HEIGHTS.map((heightFraction, i) => (
        <div key={i} className="flex-1 flex items-end h-40 md:h-64">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${shape.id}-${finish.id}-${colour.id}`}
              className={finish.id === "chrome" ? "w-full animate-shimmer" : "w-full"}
              style={{
                height: `${heightFraction * 100}%`,
                ...shapeStyle,
                ...finishStyle,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
