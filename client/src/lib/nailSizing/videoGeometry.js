/**
 * Map video-native coordinates ↔ display container when video uses object-fit: cover.
 */
export function getCoverTransform(videoW, videoH, displayW, displayH) {
  if (!videoW || !videoH || !displayW || !displayH) {
    return { scale: 1, offsetX: 0, offsetY: 0, drawnW: displayW, drawnH: displayH };
  }
  const videoAspect = videoW / videoH;
  const displayAspect = displayW / displayH;
  let scale;
  let drawnW;
  let drawnH;
  let offsetX;
  let offsetY;
  if (videoAspect > displayAspect) {
    scale = displayH / videoH;
    drawnW = videoW * scale;
    drawnH = displayH;
    offsetX = (displayW - drawnW) / 2;
    offsetY = 0;
  } else {
    scale = displayW / videoW;
    drawnW = displayW;
    drawnH = videoH * scale;
    offsetX = 0;
    offsetY = (displayH - drawnH) / 2;
  }
  return { scale, offsetX, offsetY, drawnW, drawnH };
}

export function videoPointToDisplay(x, y, transform) {
  return {
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY,
  };
}

export function videoLengthToDisplay(length, transform) {
  return length * transform.scale;
}
