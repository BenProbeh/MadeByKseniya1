import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Always start at the top of the page after any route change. */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [pathname, search, hash]);

  return null;
}
