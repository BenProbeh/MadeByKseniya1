import { Link } from "react-router-dom";

const siteLinks = [
  { to: "/services", label: "שירותים" },
  { to: "/gallery", label: "גלריה" },
  { to: "/build-a-set", label: "עצבי סט" },
  { to: "/about", label: "אודות" },
  { to: "/booking", label: "קביעת תור" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.08] mt-16">
      <div className="max-w-content mx-auto px-6 md:px-10 py-16 grid md:grid-cols-[1.3fr_1fr_1fr] gap-12">
        <div className="space-y-4">
          <Link to="/" className="font-serif text-2xl tracking-wide inline-block">
            MadeBy<span className="violet-text">Kseniya</span>
          </Link>
          <p className="text-sm text-white/55 leading-relaxed max-w-xs">
            סטודיו בוטיק לציפורניים — חוויה פרימיום מרגע שקבעת תור ועד הברק האחרון.
          </p>
        </div>

        <div className="space-y-4">
          <p className="section-eyebrow">Explore</p>
          <ul className="space-y-2.5 text-sm text-white/55">
            {siteLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors duration-300 hover:text-violet-200">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <p className="section-eyebrow">Hours</p>
          <ul className="space-y-2.5 text-sm text-white/55">
            <li>ראשון–חמישי · 09:00–19:00</li>
            <li>שישי · 09:00–14:00</li>
            <li>שבת · סגור</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.08]">
        <div className="max-w-content mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs tracking-wide text-white/35">
          <p>&copy; {new Date().getFullYear()} MadeByKseniya · כל הזכויות שמורות</p>
          <p>סטודיו ציפורניים פרימיום</p>
        </div>
      </div>
    </footer>
  );
}
