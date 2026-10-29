import { Link } from "react-router-dom";
import { ChevronLeft, Sparkles } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import { PACKAGES } from "../lib/packages.js";

export default function Services() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">
      <PageHeader title="המסלולים" subtitle="תבחרי את המסלול, אני אדאג לשאר." />
      <ul className="space-y-3">
        {PACKAGES.map((p) => (
          <li key={p.slug}>
            <Link
              to={`/services/${p.slug}`}
              className={`card flex items-center gap-4 p-5 min-h-[6.5rem] active:bg-oled-800 transition-colors ${p.featured ? "border-violet-400/50" : ""}`}
            >
              <span className="flex-1 min-w-0 space-y-1.5">
                <span className="flex items-center gap-2 t-foot">
                  {p.featured && <Sparkles size={15} className="text-violet-300" aria-hidden="true" />}
                  {p.tagline}
                </span>
                <span className="block font-brand text-[1.0625rem] tracking-wide text-white">{p.title}</span>
                <span className="block t-sub">
                  החל מ־<span className="tnum">{p.fromPrice}</span> ₪
                </span>
              </span>
              <ChevronLeft size={22} className="text-white/35 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
