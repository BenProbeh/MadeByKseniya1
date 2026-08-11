/** Minimal Waze mark for the post-booking directions CTA. */
export default function WazeIcon({ className = "w-12 h-12" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="22" fill="#33CCFF" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="#1A9FD9" strokeWidth="2" />
      <path
        d="M14 22c0-6.2 4.5-10 10-10s10 3.8 10 10c0 3.4-1.4 5.8-3.2 8.2-.9 1.2-1.8 2.4-2.4 3.8-.4.9-1.1 2.4-2.2 2.4h-4.4c-1.1 0-1.8-1.5-2.2-2.4-.6-1.4-1.5-2.6-2.4-3.8C15.4 27.8 14 25.4 14 22z"
        fill="#0A2540"
      />
      <circle cx="19.5" cy="21.5" r="2.2" fill="#33CCFF" />
      <circle cx="28.5" cy="21.5" r="2.2" fill="#33CCFF" />
      <path
        d="M19 27.5c1.4 1.4 3 2.1 5 2.1s3.6-.7 5-2.1"
        fill="none"
        stroke="#33CCFF"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
