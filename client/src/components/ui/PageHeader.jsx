/**
 * Screen title block: large title, optional supporting line and a trailing action.
 * Lives at the top of the scrolling content (the app bar above stays minimal).
 */
export default function PageHeader({ title, subtitle, action, className = "" }) {
  return (
    <header className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="t-large-title md:text-[2.25rem] md:leading-[2.75rem]">{title}</h1>
        {subtitle && <p className="t-sub mt-1.5 max-w-prose">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
