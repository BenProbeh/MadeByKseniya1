/** Planned "nothing here yet" state: what this place is for and the one thing to do next. */
export default function EmptyState({ icon: Icon, title, text, action, compact = false, className = "" }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "gap-2 py-6" : "gap-3 py-10"} px-4 ${className}`}>
      {Icon && (
        <span className="empty-icon grid place-items-center w-14 h-14 rounded-full border border-violet-400/30 bg-violet-400/10 text-violet-200 shadow-glow-soft mb-1" aria-hidden="true">
          <Icon size={26} strokeWidth={1.75} />
        </span>
      )}
      <p className="t-headline">{title}</p>
      {text && <p className="t-sub max-w-xs">{text}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
