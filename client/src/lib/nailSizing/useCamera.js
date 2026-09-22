import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera stream can be opened before the <video> mounts (permission step).
 * Always re-bind streamRef → video when the element appears, otherwise the
 * browser shows "camera in use" while the UI stays black.
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | requesting | ready | denied | unavailable | insecure | unsupported | error
  const [errorHe, setErrorHe] = useState("");

  const attachToVideo = useCallback(async (el) => {
    const stream = streamRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    try {
      await el.play();
    } catch {
      // Autoplay can fail until a user gesture; muted + playsInline usually ok.
    }
  }, []);

  const setVideoRef = useCallback(
    (node) => {
      videoRef.current = node;
      if (node) {
        void attachToVideo(node);
      }
    },
    [attachToVideo]
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((s) => (s === "ready" || s === "requesting" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    setErrorHe("");
    if (typeof window === "undefined") return;
    if (!window.isSecureContext && location.hostname !== "localhost") {
      setStatus("insecure");
      setErrorHe("המצלמה זמינה רק באתר מאובטח (HTTPS) או ב־localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorHe("הדפדפן אינו תומך בגישה למצלמה.");
      return;
    }

    // Already have a live stream — just re-bind to the current video element.
    const live = streamRef.current?.getVideoTracks?.().some((t) => t.readyState === "live");
    if (live) {
      await attachToVideo(videoRef.current);
      setStatus("ready");
      return;
    }

    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      await attachToVideo(videoRef.current);
      setStatus("ready");
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied");
        setErrorHe(
          "הגישה למצלמה נדחתה. אפשר לפתוח את ההרשאה בהגדרות הדפדפן/המכשיר ולנסות שוב."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("unavailable");
        setErrorHe("לא נמצאה מצלמה זמינה במכשיר.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setStatus("error");
        setErrorHe("המצלמה בשימוש באפליקציה אחרת. סגרי אותה ונסי שוב.");
      } else {
        setStatus("error");
        setErrorHe("לא הצלחנו לפתוח את המצלמה. נסי שוב.");
      }
    }
  }, [attachToVideo]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      const live = streamRef.current?.getVideoTracks?.().some((t) => t.readyState === "live");
      if (status === "ready" && !live) {
        setStatus("error");
        setErrorHe("חיבור המצלמה נקטע. לחצי שוב על הפעלת מצלמה.");
      } else if (status === "ready" && live) {
        void attachToVideo(videoRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status, attachToVideo]);

  return { videoRef, setVideoRef, status, errorHe, start, stop, attachToVideo };
}
