import { telHref } from "../../lib/phone.js";

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
      />
    </svg>
  );
}

/** Plain tel: link — the phone app opens only when staff tap it. */
export default function DialButton({ phoneE164, phoneDisplay, name, className = "" }) {
  const href = telHref(phoneE164);
  if (!href) return null;
  return (
    <a
      href={href}
      aria-label={`חיוג אל ${name} ${phoneDisplay || ""}`.trim()}
      className={`inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 px-3 py-1 min-h-[32px] text-xs text-violet-100 transition-colors hover:border-violet-400/70 hover:bg-violet-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${className}`}
    >
      <PhoneIcon />
      <span dir="ltr">{phoneDisplay || phoneE164}</span>
    </a>
  );
}
