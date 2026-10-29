/**
 * Camera stream lifecycle — opened only from a tap; stopped on leave, tab hide, page exit and unmount.
 * A request still in flight when the camera is stopped is released the moment it resolves, so a slow
 * permission prompt can never leave the camera running in the background.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { NAIL_SIZING_COPY as C } from "./copy.js";
import { releaseCamera, stopStreamTracks } from "./cameraLifecycle.js";

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const generation = useRef(0);
  const [status, setStatus] = useState("idle"); // idle | requesting | ready | denied | unavailable | insecure | unsupported | error
  const [errorHe, setErrorHe] = useState("");
  // iOS can refuse play() without a fresh tap; the UI then shows a "tap to start" layer instead of a black box.
  const [playBlocked, setPlayBlocked] = useState(false);

  const attachToVideo = useCallback(async (el) => {
    const stream = streamRef.current;
    if (!el || !stream) return false;
    if (el.srcObject !== stream) el.srcObject = stream;
    try {
      await el.play();
      setPlayBlocked(false);
      return true;
    } catch {
      setPlayBlocked(true);
      return false;
    }
  }, []);

  const setVideoRef = useCallback(
    (node) => {
      videoRef.current = node;
      if (node) void attachToVideo(node);
    },
    [attachToVideo]
  );

  const stop = useCallback(() => {
    generation.current += 1;
    streamRef.current = releaseCamera({ stream: streamRef.current, video: videoRef.current });
    setPlayBlocked(false);
    setErrorHe("");
    setStatus((s) => (s === "denied" || s === "insecure" || s === "unsupported" ? s : "idle"));
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

    const myGeneration = ++generation.current;
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (myGeneration !== generation.current) {
        // Stopped (left the page, hid the tab) while the prompt was open: never keep this stream.
        stopStreamTracks(stream);
        return;
      }
      streamRef.current = stream;
      // If the camera is unplugged or taken by another app, say so instead of freezing on the last frame.
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener?.("ended", () => {
          if (streamRef.current === stream) {
            streamRef.current = null;
            setStatus("error");
            setErrorHe(C.errors.interrupted);
          }
        });
      });
      await attachToVideo(videoRef.current);
      setStatus("ready");
    } catch (err) {
      if (myGeneration !== generation.current) return;
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        setStatus("denied");
        setErrorHe(C.errors.denied);
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
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

  const resume = useCallback(() => attachToVideo(videoRef.current), [attachToVideo]);

  // Unmount → full stop
  useEffect(() => () => stop(), [stop]);

  // Tab hidden / page exit → stop (she taps to resume; nothing restarts on its own)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stop);
    };
  }, [stop]);

  return { videoRef, setVideoRef, status, errorHe, playBlocked, start, stop, resume };
}
