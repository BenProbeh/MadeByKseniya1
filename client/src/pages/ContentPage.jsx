import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import ContentPageRenderer from "../components/content/ContentPageRenderer.jsx";
import { fetchPublishedPage } from "../lib/authApi.js";

function setMetaDescription(content) {
  const tag = document.querySelector('meta[name="description"]');
  if (!tag) return null;
  const previous = tag.getAttribute("content");
  if (content) tag.setAttribute("content", content);
  return previous;
}

/** Published staff-managed page at /:slug. Unknown or draft pages send the visitor to /services. */
export default function ContentPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", page: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", page: null });
    if (!/^[a-z0-9-]{2,60}$/.test(String(slug || ""))) {
      setState({ status: "missing", page: null });
      return undefined;
    }
    fetchPublishedPage(slug)
      .then((page) => !cancelled && setState({ status: "ready", page }))
      .catch((err) => {
        if (cancelled) return;
        setState({ status: err?.response?.status === 404 ? "missing" : "error", page: null });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state.status !== "ready") return undefined;
    const previousTitle = document.title;
    document.title = `${state.page.seoTitle || state.page.title} · MadeByKseniya`;
    const previousDescription = setMetaDescription(state.page.seoDescription || state.page.subtitle);
    return () => {
      document.title = previousTitle;
      if (previousDescription != null) setMetaDescription(previousDescription);
    };
  }, [state]);

  if (state.status === "missing") return <Navigate to="/services" replace />;

  if (state.status === "error") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <section className="glass-panel p-8 space-y-3">
          <p className="text-sm text-amber-200" role="alert">
            לא הצלחתי לטעון את הדף כרגע. אפשר לרענן ולנסות שוב.
          </p>
        </section>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-white/45 text-center">הדף נטען…</p>
      </div>
    );
  }

  return <ContentPageRenderer page={state.page} />;
}
