import { roleLabel } from "../../lib/roles.js";

const STYLES = {
  owner: "bg-violet-gradient text-oled-950 border-transparent font-semibold",
  admin: "border-violet-400/50 text-violet-200",
  customer: "border-white/15 text-white/55",
};

export default function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] tracking-wide shrink-0 ${
        STYLES[role] || STYLES.customer
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}
