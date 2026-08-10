import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Hero from "../components/Hero.jsx";
import ServiceCard from "../components/ServiceCard.jsx";
import ScrollCue from "../components/ScrollCue.jsx";
import { getServices } from "../lib/api.js";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const principles = [
  { n: "01", title: "חומרים פרימיום", desc: "ג'לים ולקים מהמותגים המובילים בעולם, ללא פשרות." },
  { n: "02", title: "היגיינה קפדנית", desc: "כלים סטריליים חד־פעמיים לכל לקוחה, בכל תור." },
  { n: "03", title: "עיצוב אישי", desc: "כל תור מתחיל בשיחה קצרה כדי להתאים את המראה בול בשבילך." },
];

export default function Home() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    getServices().then((data) => setServices(data.slice(0, 4)));
  }, []);

  return (
    <div>
      <Hero />

      <section className="max-w-content mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          <motion.div {...fadeUp} className="space-y-6">
            <span className="section-eyebrow">Philosophy</span>
            <h2 className="font-serif font-medium text-display-md text-white leading-[1.15]">
              יוקרה היא לא רעש.
              <br />
              היא תשומת לב <span className="violet-text">לכל פרט קטן.</span>
            </h2>
            <p className="text-white/60 leading-relaxed max-w-md">
              בסטודיו שלנו כל שלב מתוכנן מראש — מהייעוץ הקצר בתחילת התור, דרך בחירת החומרים,
              ועד לגימור האחרון שנבדק פעמיים לפני שאת יוצאת מהדלת.
            </p>
          </motion.div>

          <div className="space-y-10">
            {principles.map((p, i) => (
              <motion.div
                key={p.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-6 pb-10 border-b border-white/[0.08] last:border-b-0 last:pb-0"
              >
                <span className="font-serif text-2xl text-violet-400/60 shrink-0">{p.n}</span>
                <div>
                  <h3 className="text-base font-semibold text-white/90 mb-1.5">{p.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-content mx-auto px-6 md:px-10 py-8">
        <div className="flex items-end justify-between mb-10">
          <div className="space-y-3">
            <span className="section-eyebrow">Signature</span>
            <h2 className="font-serif font-medium text-2xl md:text-3xl text-white">
              שירותים נבחרים
            </h2>
          </div>
          <Link to="/services" className="btn-text hidden sm:inline-flex">
            <span>לכל השירותים</span>
            <span className="btn-text-arrow">←</span>
            <span className="btn-text-underline absolute -bottom-1 inset-x-0" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
        <Link to="/services" className="btn-text sm:hidden mt-8 justify-center w-full">
          <span>לכל השירותים</span>
          <span className="btn-text-arrow">←</span>
        </Link>
      </section>

      <ScrollCue label="גלי את גלריית הגוונים ועצבי סט משלך" />

      <section className="max-w-content mx-auto px-6 md:px-10 pb-24 md:pb-32">
        <motion.div
          {...fadeUp}
          className="glass-panel p-9 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8"
        >
          <div className="text-center md:text-right space-y-3">
            <span className="section-eyebrow justify-center md:justify-start">Configurator</span>
            <h3 className="font-serif font-medium text-2xl md:text-3xl text-white">
              עצבי את זה. <span className="violet-text">וראי את המחיר.</span>
            </h3>
            <p className="text-white/60 max-w-md">
              בחרי צורה, גוון, גימור ואורך — ותראי את הסט שלך מתעצב מולך בזמן אמת.
            </p>
          </div>
          <Link to="/build-a-set" className="btn-ghost whitespace-nowrap shrink-0">
            עצבי סט עכשיו
          </Link>
        </motion.div>
      </section>

      <section className="max-w-content mx-auto px-6 md:px-10 pb-28 md:pb-36">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-sm border border-white/[0.08] px-8 py-16 md:px-16 md:py-24 text-center"
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(176,38,255,0.22),transparent_70%)]" />
          <span className="section-eyebrow justify-center mb-6">Reservations</span>
          <h2 className="font-serif font-medium text-3xl md:text-5xl text-white max-w-2xl mx-auto leading-[1.15] mb-5">
            מוכנה <span className="violet-text">לפינוק הבא</span> שלך?
          </h2>
          <p className="text-white/60 max-w-lg mx-auto mb-10">
            קבעי תור אונליין תוך פחות מדקה, או שאלי את הקונסיירז&rsquo; הדיגיטלי שלנו מה הכי מתאים
            לך.
          </p>
          <Link to="/booking" className="btn-violet">
            קביעת תור
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
