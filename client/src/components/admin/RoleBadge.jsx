import { roleLabel } from "../../lib/roles.js";

const STYLES = {
  owner: "bg-violet-400/20 text-violet-100",
  admin: "bg-white/[0.08] text-violet-200",
  customer: "bg-white/[0.05] text-white/55",
};

export default function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-cap font-medium shrink-0 ${
        STYLES[role] || STYLES.customer
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}
