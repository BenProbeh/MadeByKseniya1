import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PACKAGES } from "../lib/packages.js";

/** Cursor-era entrance: rise 24px, staggered, editorial ease. */
const rise = (i, still) =>
  still
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-40px" },
        transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
      };

function PackageCard({ pkg, index, still }) {
  const inner = (
    <div className="relative z-[1] flex flex-col items-center text-center gap-5 px-6 pt-9 pb-7">
      {!pkg.featured && <span className="t-foot tracking-wide">{pkg.tagline}</span>}
      <h2 className="marquee text-[2.35rem] leading-[1.05] md:text-[2.75rem]">{pkg.title}</h2>
      <p className="flex items-baseline gap-2">
        <span className="t-sub">החל מ־</span>
        <span className="price text-[2rem] leading-none">{pkg.fromPrice}</span>
        <span className="price text-xl leading-none">₪</span>
      </p>
      <span className="btn-violet w-full mt-1">לפרטים ומחירים</span>
    </div>
  );

  return (
    <motion.li {...rise(index, still)} className="relative">
      {pkg.featured && (
        <span className="absolute -top-3 inset-x-0 z-[2] mx-auto w-fit rounded-full bg-violet-gradient px-4 py-1 text-[11px] tracking-[0.2em] font-semibold shadow-glow" style={{ color: "#000" }}>
          הכי פופולרי 🤩
        </span>
      )}
      <Link
        to={`/services/${pkg.slug}`}
        aria-label={`${pkg.title}, החל מ־${pkg.fromPrice} שקלים. לפרטים ומחירים`}
        className={`group block rounded-card transition-transform duration-300 ease-editorial active:scale-[0.985] ${
          pkg.featured ? "marquee-frame shadow-glow" : "card"
        }`}
      >
        {pkg.featured ? <div className="marquee-frame__inner">{inner}</div> : inner}
      </Link>
    </motion.li>
  );
}

/**
 * Packages — the flagship of the Neon Marquee direction: each package name is lit in the Cursor-era dot-matrix,
 * prices glow in the brand gradient, and the most popular package sits in a frame of travelling light.
 */
export default function Services() {
  const still = useReducedMotion();
  return (
    <div className="max-w-xl mx-auto pt-4 pb-6 space-y-10">
      <header className="text-center space-y-3">
        <span className="section-eyebrow">Packages</span>
        <h1 className="text-[2.25rem] leading-tight md:text-5xl">
          בחרי <span className="violet-text">מסלול</span>
        </h1>
        <p className="t-sub">תבחרי את המסלול אני אדאג לשאר 🔥</p>
      </header>

      <ul className="space-y-7">
        {PACKAGES.map((pkg, i) => (
          <PackageCard key={pkg.slug} pkg={pkg} index={i} still={still} />
        ))}
      </ul>
    </div>
  );
}
