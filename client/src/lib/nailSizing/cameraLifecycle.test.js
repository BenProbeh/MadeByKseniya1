import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { releaseCamera, stopStreamTracks } from "./cameraLifecycle.js";
import { useCamera } from "./useCamera.js";
import { CALIBRATION_COINS } from "./coins.js";
import { NAIL_SIZING_COPY } from "./copy.js";

function makeTrack(readyState = "live") {
  return {
    readyState,
    stop: vi.fn(function stop() {
      this.readyState = "ended";
    }),
  };
}

function makeStream(tracks = [makeTrack()]) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  };
}

describe("releaseCamera / stopStreamTracks", () => {
  it("stops every track on the stream", () => {
    const t1 = makeTrack();
    const t2 = makeTrack();
    const stream = makeStream([t1, t2]);
    stopStreamTracks(stream);
    expect(t1.stop).toHaveBeenCalledTimes(1);
    expect(t2.stop).toHaveBeenCalledTimes(1);
  });

  it("clears video.srcObject and pauses video", () => {
    const track = makeTrack();
    const stream = makeStream([track]);
    const video = {
      srcObject: stream,
      pause: vi.fn(),
    };
    const cleared = releaseCamera({ stream, video });
    expect(cleared).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("stops tracks from video.srcObject when stream ref is null", () => {
    const track = makeTrack();
    const stream = makeStream([track]);
    const video = { srcObject: stream, pause: vi.fn() };
    releaseCamera({ stream: null, video });
    expect(track.stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});

describe("useCamera lifecycle", () => {
  let getUserMedia;

  beforeEach(() => {
    getUserMedia = vi.fn(async () => makeStream());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle and does not open a stream on mount", () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.status).toBe("idle");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("opens one stream on start()", async () => {
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("does not open a second stream when already live", async () => {
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("stop() ends tracks and returns to idle", async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValueOnce(makeStream([track]));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("unmount stops the camera", async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValueOnce(makeStream([track]));
    const { result, unmount } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("pagehide stops the camera", async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValueOnce(makeStream([track]));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("visibility hidden stops the camera without auto-restart", async () => {
    const track = makeTrack();
    getUserMedia.mockResolvedValueOnce(makeStream([track]));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("returning after stop requires a new start() for a new stream", async () => {
    const track1 = makeTrack();
    const track2 = makeTrack();
    getUserMedia
      .mockResolvedValueOnce(makeStream([track1]))
      .mockResolvedValueOnce(makeStream([track2]));
    const { result } = renderHook(() => useCamera());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe("idle");
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(track1.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("ready");
  });
});

describe("copy + coins", () => {
  it("avoids robotic English terms in user-facing copy", () => {
    const blob = JSON.stringify(NAIL_SIZING_COPY);
    expect(blob.toLowerCase()).not.toMatch(/\bconfidence\b|\bvalidation\b|\bthreshold\b|\bdetected\b|request camera/i);
  });

  it("maps each coin to a distinct local imageSrc", () => {
    const srcs = CALIBRATION_COINS.map((c) => c.imageSrc);
    expect(srcs.every((s) => typeof s === "string" && s.startsWith("/assets/coins/"))).toBe(true);
    expect(new Set(srcs).size).toBe(CALIBRATION_COINS.length);
    expect(CALIBRATION_COINS.every((c) => c.imageAlt && c.imageAlt.includes("מטבע"))).toBe(true);
  });
});
