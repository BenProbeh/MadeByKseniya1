import { useCallback, useEffect, useRef, useState } from "react";

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | requesting | ready | denied | unavailable | insecure | unsupported | error
  const [errorHe, setErrorHe] = useState("");

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
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
  }, []);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      // If tracks ended while backgrounded, surface a recoverable state.
      const live = streamRef.current?.getVideoTracks?.().some((t) => t.readyState === "live");
      if (status === "ready" && !live) {
        setStatus("error");
        setErrorHe("חיבור המצלמה נקטע. לחצי שוב על הפעלת מצלמה.");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  return { videoRef, status, errorHe, start, stop };
}
