import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { safeHref, safeImageUrl } from "../../lib/contentPages.js";

/**
 * Renders a staff-managed page from typed, plain-text sections using the site's own components.
 * Text is rendered by React (escaped); there is no HTML injection path.
 */

const reveal = (i) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, delay: Math.min(i, 6) * 0.05, ease: [0.22, 1, 0.36, 1] },
});

function isInternal(href) {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
}

function SmartLink({ href: rawHref, className, children }) {
  const href = safeHref(rawHref);
  if (!href) return <span className={className}>{children}</span>;
  if (isInternal(href)) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  const external = href.startsWith("https:");
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

function Paragraph({ text }) {
  return (
    <>
      {String(text)
        .split(/\n{2,}/)
        .map((block, i) => (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        ))}
    </>
  );
}

function Section({ section }) {
  const { type, data = {} } = section;
  switch (type) {
    case "heading":
      return <h2 className="font-serif text-2xl md:text-3xl text-white">{data.text}</h2>;
    case "paragraph":
      return (
        <div className="font-serif text-white/70 leading-relaxed text-base md:text-lg space-y-4">
          <Paragraph text={data.text} />
        </div>
      );
    case "list": {
      const ListTag = data.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={`font-serif text-white/70 leading-relaxed space-y-2 ps-6 ${
            data.ordered ? "list-decimal" : "list-disc marker:text-violet-300"
          }`}
        >
          {(data.items || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );
    }
    case "image": {
      const src = safeImageUrl(data.url);
      if (!src) return null;
      return (
        <figure className="space-y-2">
          <img
            src={src}
            alt={data.alt}
            loading="lazy"
            className="w-full rounded-2xl border border-white/[0.08] object-cover"
          />
          {data.caption && <figcaption className="text-center text-xs text-white/45">{data.caption}</figcaption>}
        </figure>
      );
    }
    case "cta":
      return (
        <div className="flex justify-center pt-2">
          <SmartLink href={data.href} className={data.variant === "ghost" ? "btn-ghost" : "btn-violet"}>
            {data.label}
          </SmartLink>
        </div>
      );
    case "links":
      return (
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          {(data.items || []).map((item, i) => (
            <li key={i}>
              <SmartLink href={item.href} className="btn-text">
                <span>{item.label}</span>
                <span className="btn-text-arrow">←</span>
              </SmartLink>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export default function ContentPageRenderer({ page }) {
  const sections = page?.sections || [];
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-12 space-y-3"
      >
        {page?.eyebrow && <span className="section-eyebrow justify-center">{page.eyebrow}</span>}
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">{page?.title}</h1>
        {page?.subtitle && (
          <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">{page.subtitle}</p>
        )}
      </motion.div>

      {sections.length > 0 && (
        <div className="glass-panel p-6 md:p-10 space-y-8">
          {sections.map((section, i) => (
            <motion.div key={section._key || i} {...reveal(i)}>
              <Section section={section} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
