import { motion } from "framer-motion";

export default function About() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="section-eyebrow">About</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl mt-3">
          הסיפור מאחורי <span className="violet-text">MadeByKseniya</span>
        </h1>
      </motion.div>

      <motion.div
        className="glass-panel p-8 md:p-12 space-y-6 text-white/70 leading-relaxed text-lg"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <p>
          MadeByKseniya נולד מתוך אהבה אמיתית לעולם הציפורניים ומהרצון ליצור לכל לקוחה חוויה שמרגישה
          פרימיום מהרגע הראשון — עיצוב מדויק, חומרים איכותיים וסטודיו שמרגישים בו בבית.
        </p>
        <p>
          כל תור אצלנו מתחיל בהקשבה: מה הסגנון שלך, מה האירוע, ומה יעשה לך הכי טוב על היד. משם, אנחנו
          לוקחים את זה לרמה הבאה עם טכניקות בניה מתקדמות ועיצובים בהתאמה אישית.
        </p>
      </motion.div>
    </div>
  );
}
