import { motion } from "framer-motion";

const tiles = [
  { gradient: "from-violet-300 via-violet-500 to-oled-900", label: "מניקור ג'ל" },
  { gradient: "from-white via-violet-100 to-violet-400", label: "בניה בתבנית" },
  { gradient: "from-oled-700 via-violet-600 to-oled-950", label: "פדיקור ספא" },
  { gradient: "from-violet-400 via-white to-violet-300", label: "עיצוב אקססוריז" },
  { gradient: "from-oled-900 via-violet-500 to-violet-100", label: "בניה בטיפס" },
  { gradient: "from-violet-100 via-oled-800 to-violet-500", label: "לק ג'ל" },
];

export default function Gallery() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="section-eyebrow">Gallery</span>
        <h1 className="text-3xl md:text-5xl font-black mt-3 mb-4">
          עבודות <span className="violet-text">אחרונות</span>
        </h1>
        <p className="text-white/60">
          זהו מקום השמור לתמונות אמיתיות מהסטודיו — כרגע מוצגות אריחי דוגמה, קלי להחלפה בתמונות אמיתיות בהמשך.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiles.map((tile, i) => (
          <motion.div
            key={i}
            className={`aspect-square rounded-2xl bg-gradient-to-br ${tile.gradient} relative overflow-hidden group border border-white/10 transition-transform duration-300 hover:scale-[1.02]`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
          >
            <div className="absolute inset-0 bg-oled-950/40 group-hover:bg-oled-950/20 transition-colors duration-300" />
            <span className="absolute bottom-4 right-4 text-sm font-bold text-white drop-shadow-lg">
              {tile.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
