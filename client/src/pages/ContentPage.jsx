import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import EmptyState from "../components/ui/EmptyState.jsx";
import NotFound from "./NotFound.jsx";
import ContentPageRenderer from "../components/content/ContentPageRenderer.jsx";
import { fetchPublishedPage } from "../lib/authApi.js";

function setMetaDescription(content) {
  const tag = document.querySelector('meta[name="description"]');
  if (!tag) return null;
  const previous = tag.getAttribute("content");
  if (content) tag.setAttribute("content", content);
  return previous;
}

/** Published staff-managed page at /:slug. Unknown or draft pages show the 404. */
export default function ContentPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", page: null });
  const [attempt, setAttempt] = useState(0);

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
  }, [slug, attempt]);

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

  if (state.status === "missing") return <NotFound />;

  if (state.status === "error") {
    return (
      <div className="max-w-sm mx-auto pt-[4vh] pb-6 text-center space-y-3">
        <span className="section-eyebrow justify-center">Retry</span>
        <div className="card" role="alert">
          <EmptyState
            icon={RefreshCw}
            title="הדף לא נטען"
            text="לא הצלחתי לטעון את הדף כרגע. ייתכן שהחיבור נקטע לרגע."
            action={
              <button type="button" className="btn-violet" onClick={() => setAttempt((n) => n + 1)}>
                לנסות שוב
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="max-w-3xl mx-auto pt-2 pb-6">
        <p className="text-sm text-white/45 text-center">הדף נטען…</p>
      </div>
    );
  }

  return <ContentPageRenderer page={state.page} />;
}
