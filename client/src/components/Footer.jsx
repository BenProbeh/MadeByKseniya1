import { Link } from "react-router-dom";

const siteLinks = [
  { to: "/services", label: "מסלולים" },
  { to: "/gallery", label: "גלריה" },
  { to: "/build-a-set", label: "עצבי סט" },
  { to: "/nail-sizing", label: "מדידת ציפורניים" },
  { to: "/booking", label: "קביעת תור" },
];

/** Desktop only: on phones the tab bar is the navigation and a footer would just be more scrolling. */
export default function Footer() {
  return (
    <footer className="hidden md:block border-t hairline mt-16">
      <div className="max-w-content mx-auto px-8 py-12 flex flex-wrap items-start justify-between gap-10">
        <div className="space-y-3 max-w-xs">
          <p className="font-brand text-xl tracking-wide">MadeByKseniya</p>
          <p className="t-sub">סטודיו בוטיק לציפורניים — מהמדידה הראשונה ועד הברק האחרון.</p>
        </div>
        <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sub text-white/60">
          {siteLinks.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="transition-colors hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t hairline">
        <p className="max-w-content mx-auto px-8 py-5 t-foot">&copy; {new Date().getFullYear()} MadeByKseniya · כל הזכויות שמורות</p>
      </div>
    </footer>
  );
}
