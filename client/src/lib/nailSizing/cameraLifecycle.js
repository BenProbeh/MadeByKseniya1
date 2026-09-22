/**
 * Pure helpers for stopping a camera MediaStream and clearing a video element.
 * Used by useCamera and unit tests.
 */

/**
 * Stop every track on a MediaStream (or MediaStream-like object).
 * @param {MediaStream | null | undefined} stream
 */
export function stopStreamTracks(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Fully release camera: stop tracks, pause video, clear srcObject.
 * @param {{ stream?: MediaStream | null, video?: HTMLVideoElement | null }} opts
 * @returns {null} always null for the cleared stream ref
 */
export function releaseCamera({ stream = null, video = null } = {}) {
  const fromVideo =
    video && video.srcObject && typeof video.srcObject.getTracks === "function"
      ? video.srcObject
      : null;
  const active = stream || fromVideo;
  stopStreamTracks(active);
  if (video) {
    try {
      video.pause?.();
    } catch {
      /* ignore */
    }
    video.srcObject = null;
  }
  return null;
}
