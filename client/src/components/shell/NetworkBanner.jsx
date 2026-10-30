import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

const BACK_MS = 3000;

/**
 * A small lit notice at the top while the connection is gone, and a short "back" note when it returns.
 * Screens keep what they already show; this only explains why new actions may not go through.
 */
export default function NetworkBanner() {
  const [state, setState] = useState(() => (typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"));

  useEffect(() => {
    let timer;
    const offline = () => {
      window.clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState((prev) => (prev === "offline" ? "back" : prev));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setState("online"), BACK_MS);
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.clearTimeout(timer);
    };
  }, []);

  if (state === "online") return null;
  const off = state === "offline";
  return (
    <div className="fixed inset-x-0 top-[calc(var(--safe-top)+var(--header-h)+0.5rem)] z-[80] flex justify-center px-4 pointer-events-none">
      <p key={state} role="status" aria-live="polite" className={`net-banner ${off ? "" : "net-banner--back"}`}>
        <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 ${off ? "bg-white/[0.08] text-violet-200" : "bg-violet-gradient"}`} style={off ? undefined : { color: "#000" }} aria-hidden="true">
          {off ? <WifiOff size={15} /> : <Wifi size={15} />}
        </span>
        {off ? (
          <span className="min-w-0">
            <span className="block font-semibold">אין חיבור לאינטרנט</span>
            <span className="block t-foot">שליחה ושמירה יעבדו שוב כשהחיבור יחזור.</span>
          </span>
        ) : (
          <span>החיבור חזר</span>
        )}
      </p>
    </div>
  );
}
