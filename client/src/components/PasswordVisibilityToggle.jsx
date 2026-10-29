import { Eye, EyeOff } from "lucide-react";

/** Show / hide password; sits inside the field at the end edge with a full 44px target. */
export default function PasswordVisibilityToggle({ visible, onToggle }) {
  return (
    <button
      type="button"
      className="absolute inset-y-0 end-1 my-auto icon-btn text-white/60"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      aria-label={visible ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
      aria-pressed={visible}
    >
      {visible ? <EyeOff size={20} strokeWidth={1.8} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.8} aria-hidden="true" />}
    </button>
  );
}
