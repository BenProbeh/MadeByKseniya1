/**
 * Camera stream lifecycle — open only on user gesture; stop on leave / hide / unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { NAIL_SIZING_COPY as C } from "./copy.js";
import { releaseCamera } from "./cameraLifecycle.js";

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
      /* muted + playsInline usually ok after gesture */
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
    streamRef.current = releaseCamera({
      stream: streamRef.current,
      video: videoRef.current,
    });
    setErrorHe("");
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setErrorHe("");
    if (typeof window === "undefined") return;
    if (!window.isSecureContext && location.hostname !== "localhost") {
      setStatus("insecure");
      setErrorHe(C.errors.insecure);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorHe(C.errors.unsupported);
      return;
    }

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
        setErrorHe(C.errors.denied);
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("unavailable");
        setErrorHe(C.errors.unavailable);
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setStatus("error");
        setErrorHe(C.errors.busy);
      } else {
        setStatus("error");
        setErrorHe(C.errors.generic);
      }
    }
  }, [attachToVideo]);

  // Unmount → full stop
  useEffect(() => () => stop(), [stop]);

  // Tab hide / page exit → stop (no auto-restart)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      }
    };
    const onPageExit = () => {
      stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageExit);
    window.addEventListener("beforeunload", onPageExit);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageExit);
      window.removeEventListener("beforeunload", onPageExit);
    };
  }, [stop]);

  return { videoRef, setVideoRef, status, errorHe, start, stop, attachToVideo };
}
