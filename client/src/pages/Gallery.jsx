import { Link } from "react-router-dom";
import { Images } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

/** The gallery has no works to show yet: say so plainly and point to the packages and the set builder. */
export default function Gallery() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">
      <PageHeader eyebrow="Gallery" accent="גלריה" />
      <div className="card">
        <EmptyState
          icon={Images}
          title="עדיין אין כאן עבודות להצגה"
          text="בינתיים אפשר לעבור על המסלולים או לעצב סט משלך."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/services" className="btn-violet btn-sm">
                למסלולים
              </Link>
              <Link to="/build-a-set" className="btn-ghost btn-sm">
                לעיצוב סט
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}
