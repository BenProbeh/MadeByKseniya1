/**
 * Screen title block: large title, optional supporting line and a trailing action.
 * Lives at the top of the scrolling content (the app bar above stays minimal).
 * Neon Marquee: an optional Sekuya `eyebrow` above, and an `accent` word lit in violet after the title.
 */
/** Splits a title so its last word can be lit: `{...litLast("המידות שלך")}` → title "המידות", accent "שלך". */
export function litLast(text) {
  const i = text.lastIndexOf(" ");
  return i < 0 ? { title: text } : { title: text.slice(0, i), accent: text.slice(i + 1) };
}

export default function PageHeader({ eyebrow, title, accent, subtitle, action, className = "" }) {
  return (
    <header className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <span className="section-eyebrow mb-2">{eyebrow}</span>}
        <h1 className="t-large-title md:text-[2.25rem] md:leading-[2.75rem]">
          {title}
          {accent && (
            <>
              {" "}
              <span className="violet-text">{accent}</span>
            </>
          )}
        </h1>
        {subtitle && <p className="t-sub mt-1.5 max-w-prose">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
