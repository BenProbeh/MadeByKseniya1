import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SizingProgress from "../components/nail-sizing/SizingProgress.jsx";
import PrepStep from "../components/nail-sizing/PrepStep.jsx";
import CoinStep from "../components/nail-sizing/CoinStep.jsx";
import CameraPermissionStep from "../components/nail-sizing/CameraPermissionStep.jsx";
import GuideStep from "../components/nail-sizing/GuideStep.jsx";
import MeasureStep from "../components/nail-sizing/MeasureStep.jsx";
import SummaryStep from "../components/nail-sizing/SummaryStep.jsx";
import { ALL_FINGERS, GUIDE_SEEN_KEY } from "../lib/nailSizing/constants.js";
import { useCamera } from "../lib/nailSizing/useCamera.js";
import {
  createSession,
  loadSession,
  saveSession,
  clearSession,
  saveProfile,
} from "../lib/nailSizing/sessionStore.js";
import { saveMeasurementProfile } from "../lib/api.js";

export default function NailSizing() {
  const camera = useCamera();
  const [session, setSession] = useState(() => loadSession() || createSession());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guideSeenBefore] = useState(() => sessionStorage.getItem(GUIDE_SEEN_KEY) === "1");

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    // Prevent accidental scroll restoration mid-flow on mobile.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [session.step, session.fingerIndex]);

  const finger = ALL_FINGERS[session.fingerIndex] || ALL_FINGERS[0];

  function patch(partial) {
    setSession((s) => ({ ...s, ...partial }));
    setSaved(false);
  }

  function goStep(step) {
    patch({ step });
  }

  const completedCount = useMemo(
    () => Object.values(session.measurements).filter((m) => m.status === "confirmed").length,
    [session.measurements]
  );

  function handleFingerConfirm(payload) {
    const key = finger.key;
    const measurements = {
      ...session.measurements,
      [key]: {
        ...session.measurements[key],
        ...payload,
        key,
        handId: finger.handId,
        fingerId: finger.fingerId,
        handLabelHe: finger.handLabelHe,
        fingerLabelHe: finger.fingerLabelHe,
        coinId: session.coinId,
      },
    };

    const nextIndex = Math.min(session.fingerIndex + 1, ALL_FINGERS.length - 1);
    const allDone = Object.values(measurements).every((m) => m.status === "confirmed");

    patch({
      measurements,
      fingerIndex: allDone ? session.fingerIndex : nextIndex,
      step: allDone ? "summary" : "measure",
    });
  }

  function retakeFinger(key) {
    const idx = ALL_FINGERS.findIndex((f) => f.key === key);
    patch({ fingerIndex: Math.max(0, idx), step: "measure" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const profile = {
        phone: session.phone,
        coinId: session.coinId,
        measurements: session.measurements,
        completedCount,
        source: "camera-guided",
        createdAt: session.createdAt,
      };
      saveProfile(session.phone, profile);
      await saveMeasurementProfile(profile).catch(() => null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Nail sizing</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          מדידת <span className="violet-text">מידת הציפורניים</span>
        </h1>
        <p className="text-white/60 text-sm md:text-base max-w-xl mx-auto">
          כיול עם מטבע אמיתי, צילום מונחה לכל אצבע, ושמירת פרופיל מידות להזמנות הבאות.
        </p>
      </div>

      <SizingProgress
        step={session.step}
        fingerIndex={session.fingerIndex}
        totalFingers={ALL_FINGERS.length}
      />

      {session.step === "prep" && <PrepStep onNext={() => goStep("coin")} />}

      {session.step === "coin" && (
        <CoinStep
          selectedId={session.coinId}
          onSelect={(coinId) => patch({ coinId })}
          onBack={() => goStep("prep")}
          onNext={() => goStep("camera")}
        />
      )}

      {session.step === "camera" && (
        <CameraPermissionStep
          camera={camera}
          onBack={() => goStep("coin")}
          onGrantedContinue={() => {
            patch({ consentCamera: true });
            goStep(guideSeenBefore ? "measure" : "guide");
          }}
        />
      )}

      {session.step === "guide" && (
        <GuideStep
          canSkip={guideSeenBefore}
          onBack={() => goStep("camera")}
          onSkip={() => goStep("measure")}
          onNext={() => {
            sessionStorage.setItem(GUIDE_SEEN_KEY, "1");
            goStep("measure");
          }}
        />
      )}

      {session.step === "measure" && session.coinId && (
        <MeasureStep
          camera={camera}
          coinId={session.coinId}
          finger={finger}
          existing={session.measurements[finger.key]}
          onBack={() => goStep(guideSeenBefore ? "camera" : "guide")}
          onConfirm={handleFingerConfirm}
        />
      )}

      {session.step === "measure" && !session.coinId && (
        <div className="glass-panel p-6 text-center space-y-4">
          <p className="text-white/60 text-sm">יש לבחור מטבע לפני המדידה.</p>
          <button type="button" className="btn-violet" onClick={() => goStep("coin")}>
            בחירת מטבע
          </button>
        </div>
      )}

      {session.step === "summary" && (
        <SummaryStep
          measurements={session.measurements}
          phone={session.phone}
          onPhoneChange={(phone) => patch({ phone })}
          onRetake={retakeFinger}
          onSave={handleSave}
          saving={saving}
          saved={saved}
          onBack={() => patch({ step: "measure", fingerIndex: ALL_FINGERS.length - 1 })}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link to="/booking" className="btn-text">
          <span>לקביעת תור</span>
          <span className="btn-text-arrow">←</span>
        </Link>
        <button
          type="button"
          className="text-xs text-white/35 hover:text-white/60 transition-colors"
          onClick={() => {
            camera.stop();
            clearSession();
            setSession(createSession());
            setSaved(false);
          }}
        >
          איפוס תהליך
        </button>
      </div>
    </div>
  );
}
