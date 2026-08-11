import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Ils from "../components/Ils.jsx";

const TRACKS = [
  { title: "Basic Bitch", price: 111, detailSlug: "basic-bitch" },
  { title: "Bad Bitch", price: 222, featured: true, detailSlug: "bad-bitch" },
  { title: "Stay High", price: 282, detailSlug: "stay-high" },
];

export default function Services() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="section-eyebrow">Packages</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl mt-3 mb-4">
          בחרי <span className="violet-text">מסלול</span>
        </h1>
        <p className="text-white/60">תבחרי את המסלול אני אדאג לשאר 🔥</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        {TRACKS.map((track, i) => (
          <motion.div
            key={track.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className={`relative glass-panel p-8 flex flex-col items-center text-center gap-6 transition-colors duration-300 ${
              track.featured ? "border-violet-400/50 shadow-glow" : "hover:border-white/25"
            }`}
          >
            {track.featured && (
              <span className="absolute -top-3 text-[11px] tracking-[0.2em] uppercase bg-violet-gradient text-oled-950 font-semibold rounded-full px-4 py-1">
                הכי פופולרי 🤩
              </span>
            )}

            {track.detailSlug ? (
              <Link to={`/services/${track.detailSlug}`} className="contents">
                <h2 className="font-serif text-3xl md:text-4xl text-white">{track.title}</h2>
                <p className="font-sans text-2xl font-black violet-text">
                  {track.price}
                  <Ils />
                </p>
                <span className="btn-violet w-full mt-2">לפרטים ומחירים</span>
              </Link>
            ) : (
              <>
                <h2 className="font-serif text-3xl md:text-4xl text-white">{track.title}</h2>
                <p className="font-sans text-2xl font-black violet-text">
                  {track.price}
                  <Ils />
                </p>
                <Link
                  to="/booking"
                  state={{ prefillNotes: `בקשה: מסלול ${track.title}` }}
                  className="btn-violet w-full mt-2"
                >
                  קביעת תור
                </Link>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
