/** Toggle button: human eye / eye-off for password visibility. */
export default function PasswordVisibilityToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      className="absolute inset-y-0 end-2 z-10 flex items-center justify-center w-10 h-full text-white/75 hover:text-violet-200 transition-colors"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={visible ? "הסתרת סיסמה" : "הצגת סיסמה"}
      aria-pressed={visible}
    >
      {visible ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 002.8 2.8" />
          <path d="M9.9 5.1A9 9 0 0121 12c-.5 1-1.2 1.9-2.1 2.6" />
          <path d="M6.1 6.1A9.4 9.4 0 003 12c1.5 3.8 5.1 6.5 9 6.5 1.4 0 2.7-.3 3.9-.9" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
