import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SizingProgress from "../components/nail-sizing/SizingProgress.jsx";
import PrepStep from "../components/nail-sizing/PrepStep.jsx";
import CoinStep from "../components/nail-sizing/CoinStep.jsx";
import CameraPermissionStep from "../components/nail-sizing/CameraPermissionStep.jsx";
import GuideStep from "../components/nail-sizing/GuideStep.jsx";
import FingerSelectStep from "../components/nail-sizing/FingerSelectStep.jsx";
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

function fingersFromKeys(keys) {
  const set = new Set(keys || []);
  return ALL_FINGERS.filter((f) => set.has(f.key));
}

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
    if (session.step === "measure") {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [session.step, session.fingerIndex]);

  // Old sessions may land on measure without finger selection — send them back.
  useEffect(() => {
    if (
      session.step === "measure" &&
      (!Array.isArray(session.selectedFingerKeys) || session.selectedFingerKeys.length === 0)
    ) {
      setSession((s) => ({ ...s, step: "fingers", fingerIndex: 0 }));
    }
  }, [session.step, session.selectedFingerKeys]);

  const selectedFingers = useMemo(
    () => fingersFromKeys(session.selectedFingerKeys),
    [session.selectedFingerKeys]
  );

  const finger = selectedFingers[session.fingerIndex] || selectedFingers[0] || ALL_FINGERS[0];

  function patch(partial) {
    setSession((s) => ({ ...s, ...partial }));
    setSaved(false);
  }

  function goStep(step) {
    patch({ step });
  }

  function afterCamera() {
    patch({ consentCamera: true, step: guideSeenBefore ? "fingers" : "guide" });
  }

  const completedCount = useMemo(
    () =>
      selectedFingers.filter((f) => session.measurements[f.key]?.status === "confirmed").length,
    [session.measurements, selectedFingers]
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

    const queue = fingersFromKeys(session.selectedFingerKeys);
    const currentIdx = queue.findIndex((f) => f.key === key);
    const allSelectedDone = queue.every((f) => measurements[f.key]?.status === "confirmed");
    const nextIndex = Math.min(Math.max(currentIdx, 0) + 1, Math.max(queue.length - 1, 0));

    patch({
      measurements,
      fingerIndex: allSelectedDone ? currentIdx : nextIndex,
      step: allSelectedDone ? "summary" : "measure",
    });
  }

  function retakeFinger(key) {
    const idx = selectedFingers.findIndex((f) => f.key === key);
    if (idx < 0) {
      const keys = session.selectedFingerKeys.includes(key)
        ? session.selectedFingerKeys
        : [...session.selectedFingerKeys, key];
      const ordered = ALL_FINGERS.filter((f) => keys.includes(f.key));
      patch({
        selectedFingerKeys: ordered.map((f) => f.key),
        fingerIndex: Math.max(0, ordered.findIndex((f) => f.key === key)),
        step: "measure",
      });
      return;
    }
    patch({ fingerIndex: Math.max(0, idx), step: "measure" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const profile = {
        phone: session.phone,
        coinId: session.coinId,
        measurements: session.measurements,
        selectedFingerKeys: session.selectedFingerKeys,
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
          כיול עם מטבע אמיתי, צילום מונחה לאצבעות שבחרת, ושמירת פרופיל מידות להזמנות הבאות.
        </p>
      </div>

      <SizingProgress
        step={session.step}
        fingerIndex={session.fingerIndex}
        totalFingers={selectedFingers.length || session.selectedFingerKeys?.length || 0}
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
          onGrantedContinue={afterCamera}
        />
      )}

      {session.step === "guide" && (
        <GuideStep
          canSkip={guideSeenBefore}
          onBack={() => goStep("camera")}
          onSkip={() => goStep("fingers")}
          onNext={() => {
            sessionStorage.setItem(GUIDE_SEEN_KEY, "1");
            goStep("fingers");
          }}
        />
      )}

      {session.step === "fingers" && (
        <FingerSelectStep
          selectedKeys={session.selectedFingerKeys || []}
          onChange={(selectedFingerKeys) => patch({ selectedFingerKeys, fingerIndex: 0 })}
          onBack={() => goStep(guideSeenBefore ? "camera" : "guide")}
          onNext={() => {
            if ((session.selectedFingerKeys || []).length === 0) return;
            goStep("measure");
          }}
        />
      )}

      {session.step === "measure" && session.coinId && selectedFingers.length > 0 && (
        <MeasureStep
          camera={camera}
          coinId={session.coinId}
          finger={finger}
          existing={session.measurements[finger.key]}
          onBack={() => goStep("fingers")}
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
          selectedFingerKeys={session.selectedFingerKeys}
          phone={session.phone}
          onPhoneChange={(phone) => patch({ phone })}
          onRetake={retakeFinger}
          onSave={handleSave}
          saving={saving}
          saved={saved}
          onBack={() =>
            patch({
              step: "measure",
              fingerIndex: Math.max(selectedFingers.length - 1, 0),
            })
          }
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
