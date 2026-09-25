/** Toggle button: human eye / eye-off for password visibility. */
export default function PasswordVisibilityToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      className="absolute inset-y-0 left-2.5 flex items-center justify-center w-9 text-violet-200/80 hover:text-violet-100 transition-colors"
      onClick={onToggle}
      aria-label={visible ? "הסתרת סיסמה" : "הצגת סיסמה"}
      aria-pressed={visible}
    >
      {visible ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M3.5 3.5l17 17" />
          <path d="M10.6 10.7a2.5 2.5 0 003.5 3.5" />
          <path d="M9.9 5.6A10.5 10.5 0 0121.5 12c-.6 1.1-1.4 2.1-2.4 2.9" />
          <path d="M6.2 6.4C4.5 7.6 3.1 9.3 2.5 12c1.6 4.1 5.4 7 9.5 7 1.5 0 2.9-.3 4.2-.9" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M2.5 12C4.1 7.9 7.9 5 12 5s7.9 2.9 9.5 7c-1.6 4.1-5.4 7-9.5 7s-7.9-2.9-9.5-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
