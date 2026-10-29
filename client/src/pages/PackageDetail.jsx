import { useParams, Link, Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpLeft, ChevronLeft, Clock3 } from "lucide-react";
import { PACKAGE_DETAILS } from "../lib/packageData.js";

const rise = (i, still) =>
  still
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-40px" },
        transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
      };

/** One row of the price board: size in the lit dot-matrix, price in violet light, tap to book that size. */
function PriceRow({ slug, option, size }) {
  return (
    <Link
      to="/booking"
      state={{
        prefillNotes: `בקשה: ${option.name} - מידה ${size.label}`,
        skipServiceSelect: true,
        packageLabel: `${option.name} · ${size.label}`,
        packageKey: `${slug}:${option.id}:${size.label}`,
      }}
      className="list-row min-h-[4.25rem] gap-4 active:bg-violet-400/10"
      aria-label={`${option.name}, מידה ${size.label}, ${size.price} שקלים. לקביעת תור`}
    >
      <span className="marquee text-[2rem] leading-none w-10 text-center shrink-0">{size.label}</span>
      <span className="flex-1 min-w-0 t-foot">{size.detail || ""}</span>
      <span className="flex items-baseline gap-1 shrink-0">
        <span className="price text-[1.75rem] leading-none">{size.price}</span>
        <span className="price text-lg leading-none">₪</span>
      </span>
      <ChevronLeft size={20} className="text-violet-300/70 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function OptionBlock({ slug, option, index, still }) {
  const small = option.smallName;
  return (
    <motion.section {...rise(index, still)} className="space-y-4" aria-label={option.name}>
      <div className="text-center space-y-2">
        {option.name && !option.hideName && (small ? <p className="section-eyebrow">{option.name}</p> : <h2 className="text-[1.6rem] leading-tight">{option.name}</h2>)}
        {option.secondaryLabel && <p className="section-eyebrow">{option.secondaryLabel}</p>}
        <p className="t-sub max-w-md mx-auto">{option.subtitle}</p>
      </div>

      {option.pinterestUrl && (
        <div className="flex justify-center">
          <a
            href={option.pinterestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[2.75rem] text-xs tracking-wide text-violet-300/90 border border-violet-400/30 rounded-full px-4 transition-colors duration-300 hover:text-violet-200 hover:border-violet-400/60"
          >
            לעיצובי Pinterest לחצי כאן
            <ArrowUpLeft size={14} aria-hidden="true" />
          </a>
        </div>
      )}

      {option.sizes ? (
        <div className="list-group">
          {option.sizes.map((s) => (
            <PriceRow key={s.label} slug={slug} option={option} size={s} />
          ))}
        </div>
      ) : (
        <Link
          to="/booking"
          state={{
            prefillNotes: `בקשה: ${option.name}`,
            skipServiceSelect: true,
            packageLabel: option.name,
            packageKey: `${slug}:${option.id}`,
          }}
          className="card flex flex-col items-center gap-2 py-7 active:bg-violet-400/10 transition-colors"
          aria-label={`${option.name}, ${option.price} שקלים. לקביעת תור`}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="price text-[3rem] leading-none">{option.price}</span>
            <span className="price text-2xl leading-none">₪</span>
          </span>
          <span className="btn-text">לקביעת תור</span>
        </Link>
      )}

      {option.note && (
        <p className="flex items-center justify-center gap-2 t-sub text-center">
          <Clock3 size={16} className="text-violet-300 shrink-0" aria-hidden="true" />
          {option.note}
        </p>
      )}
    </motion.section>
  );
}

/** A package as a lit price board: the name in the marquee, each size one tap from booking. */
export default function PackageDetail() {
  const { slug } = useParams();
  const pkg = PACKAGE_DETAILS[slug];
  const still = useReducedMotion();

  if (!pkg) return <Navigate to="/services" replace />;

  return (
    <div className="max-w-xl mx-auto pt-2 pb-2 space-y-12">
      <motion.header
        initial={still ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center space-y-3 pt-2"
      >
        <span className="section-eyebrow">{pkg.eyebrow}</span>
        <h1 className="marquee text-[2.9rem] leading-[1.05] md:text-[3.5rem]">{pkg.title}</h1>
      </motion.header>

      <div className="space-y-14">
        {pkg.options.map((option, i) => (
          <OptionBlock key={option.id} slug={slug} option={option} index={i} still={still} />
        ))}
      </div>

      <div className="sticky-cta">
        <Link
          to="/booking"
          state={{ prefillNotes: `בקשה: ${pkg.title}`, skipServiceSelect: true, packageLabel: pkg.title }}
          className="btn-violet btn-block"
        >
          קביעת תור
        </Link>
      </div>
    </div>
  );
}
