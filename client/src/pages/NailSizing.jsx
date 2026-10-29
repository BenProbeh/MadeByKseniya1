import { useEffect, useState } from "react";
import IntroStep from "../components/nail-sizing/IntroStep.jsx";
import FingerSelectStep from "../components/nail-sizing/FingerSelectStep.jsx";
import CaptureStep from "../components/nail-sizing/CaptureStep.jsx";
import SummaryStep from "../components/nail-sizing/SummaryStep.jsx";
import { findFinger } from "../lib/nailSizing/constants.js";
import { createSession, loadSession, remainingKeys, saveSession, toPayload } from "../lib/nailSizing/sessionStore.js";
import { saveMeasurementProfile } from "../lib/api.js";
import { NAIL_SIZING_COPY as C } from "../lib/nailSizing/copy.js";

/**
 * Nail sizing: intro → choose fingers → for each finger photograph + mark coin and nail → summary → save.
 * Progress lives in sessionStorage (numbers only), so leaving and coming back continues where she was.
 */
export default function NailSizing() {
  const [session, setSession] = useState(() => loadSession() || createSession());
  const [saveState, setSaveState] = useState(session.savedAt ? "saved" : "idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [session.step]);

  const patch = (next) => setSession((s) => ({ ...s, ...(typeof next === "function" ? next(s) : next) }));
  const remaining = remainingKeys(session);
  const measuredSelected = session.selected.filter((k) => session.results[k]).length;

  function startCapture(s = session) {
    const queue = remainingKeys(s);
    const first = queue[0] || s.selected[0];
    if (!first) return patch({ step: "fingers" });
    patch({ step: "capture", current: first, returnTo: null });
  }

  function onFingerSaved(result) {
    setSaveState("idle");
    setSaveError("");
    patch((s) => {
      const results = { ...s.results, [s.current]: result };
      if (s.returnTo === "summary") return { results, step: "summary", current: null, returnTo: null, savedAt: null };
      const next = s.selected.find((k) => !results[k]);
      return next ? { results, current: next, savedAt: null } : { results, step: "summary", current: null, savedAt: null };
    });
  }

  function remeasure(key) {
    patch((s) => ({
      selected: s.selected.includes(key) ? s.selected : [...s.selected, key],
      step: "capture",
      current: key,
      returnTo: "summary",
    }));
  }

  async function save() {
    setSaveState("saving");
    setSaveError("");
    try {
      await saveMeasurementProfile(toPayload(session));
      patch({ savedAt: new Date().toISOString() });
      setSaveState("saved");
    } catch {
      setSaveState("idle");
      setSaveError(C.summary.saveError);
    }
  }

  if (session.step === "intro") {
    return (
      <IntroStep
        progress={measuredSelected && !session.savedAt ? { done: measuredSelected, total: session.selected.length } : null}
        onStart={() => patch({ step: "fingers" })}
        onResume={() => (remaining.length ? startCapture() : patch({ step: "summary" }))}
        onRestart={() => {
          setSaveState("idle");
          setSession({ ...createSession(), step: "fingers" });
        }}
      />
    );
  }

  if (session.step === "fingers") {
    return (
      <FingerSelectStep
        selected={session.selected}
        results={session.results}
        onChange={(selected) => patch({ selected })}
        onNext={() => startCapture()}
      />
    );
  }

  if (session.step === "capture" && session.current) {
    const finger = findFinger(session.current);
    const position = session.selected.indexOf(session.current) + 1;
    const isLast = session.returnTo === "summary" || !session.selected.some((k) => k !== session.current && !session.results[k]);
    return (
      <CaptureStep
        finger={finger}
        position={Math.max(position, 1)}
        total={session.selected.length}
        isLast={isLast}
        onSave={onFingerSaved}
        onExit={() => patch((s) => ({ step: Object.keys(s.results).length ? "summary" : "fingers", current: null, returnTo: null }))}
      />
    );
  }

  return (
    <SummaryStep
      results={session.results}
      remaining={remaining.length}
      saveState={saveState}
      saveError={saveError}
      onSave={() => void save()}
      onRemeasure={remeasure}
      onContinue={() => startCapture()}
    />
  );
}
