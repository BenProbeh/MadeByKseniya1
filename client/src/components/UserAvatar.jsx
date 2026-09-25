import { useState } from "react";

export default function UserAvatar({ user, className = "h-9 w-9 text-sm" }) {
  const letter = (user?.firstName || user?.username || "?").charAt(0);
  const [failed, setFailed] = useState(false);

  if (user?.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={`${className} rounded-full object-cover border border-white/15 shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${className} rounded-full bg-violet-gradient text-oled-950 font-semibold flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
