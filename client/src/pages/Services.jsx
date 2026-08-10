import { useEffect, useState } from "react";
import ServiceCard from "../components/ServiceCard.jsx";
import { getServices } from "../lib/api.js";

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getServices()
      .then(setServices)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="section-eyebrow">Services</span>
        <h1 className="text-3xl md:text-5xl font-black mt-3 mb-4">
          התפריט <span className="violet-text">המלא</span>
        </h1>
        <p className="text-white/60">כל שירותי הציפורניים שלנו, עם מחיר ומשך זמן מדויקים.</p>
      </div>

      {loading ? (
        <p className="text-center text-white/40">טוען שירותים...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <ServiceCard key={s.id} service={s} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
