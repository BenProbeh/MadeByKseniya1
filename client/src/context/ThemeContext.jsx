import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { updateThemeRequest } from "../lib/authApi.js";
import { normalizeHex } from "../lib/theme/color.js";
import { derivePalette } from "../lib/theme/palette.js";
import { applyPalette, clearThemeCache, resetTheme, writeThemeCache } from "../lib/theme/runtime.js";

const ThemeContext = createContext(null);

export const SAVE_DELAY_MS = 600;
const MESSAGE_MS = 5000;

export const THEME_MESSAGES = {
  saved: "שמרתי את הצבע שלך.",
  reset: "חזרתי לצבע המקורי של האתר",
  saveFailed: "לא הצלחתי לשמור את הצבע, אז חזרתי לצבע האחרון שנשמר. אפשר לנסות שוב.",
  resetFailed: "לא הצלחתי לחזור לצבע המקורי. הצבע האחרון שנשמר נשאר פעיל, ואפשר לנסות שוב.",
};

/** Never throws: any failure leaves the site on its default colours. */
function paintColor(color) {
  try {
    const palette = color ? derivePalette(color) : null;
    if (palette) applyPalette(palette);
    else resetTheme();
  } catch {
    try {
      resetTheme();
    } catch {
      /* no DOM */
    }
  }
}

export function ThemeProvider({ children }) {
  const { user, loading, updateUser } = useAuth();
  const userId = user?.id ?? null;
  const savedColor = normalizeHex(user?.themeColor) ?? null;

  // A preview belongs to the user who made it, so it can never carry over to the next account.
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const timerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const seqRef = useRef(0);
  const inFlightRef = useRef(0);

  const previewActive = preview && preview.userId === userId;
  const activeColor = previewActive ? preview.color : savedColor;

  // Until the session is known, keep whatever the boot script painted from the device cache.
  useLayoutEffect(() => {
    if (loading) return;
    paintColor(activeColor);
  }, [loading, activeColor]);

  // PostgreSQL is the source of truth; the device cache mirrors the signed-in user's saved colour only.
  useEffect(() => {
    if (loading) return;
    let palette = null;
    try {
      palette = userId && savedColor ? derivePalette(savedColor) : null;
    } catch {
      palette = null;
    }
    if (palette) writeThemeCache(palette);
    else clearThemeCache();
  }, [loading, userId, savedColor]);

  const cancelPending = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const showStatus = useCallback((state, message) => {
    clearTimeout(messageTimerRef.current);
    setStatus({ state, message });
    if (state === "saved") {
      messageTimerRef.current = setTimeout(() => setStatus({ state: "idle", message: "" }), MESSAGE_MS);
    }
  }, []);

  useEffect(() => {
    cancelPending();
    seqRef.current += 1;
    setStatus({ state: "idle", message: "" });
  }, [userId, cancelPending]);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      clearTimeout(messageTimerRef.current);
    },
    []
  );

  const persist = useCallback(
    async (color, { successMessage, failureMessage }) => {
      const seq = ++seqRef.current;
      const owner = userId;
      showStatus("saving", "");
      inFlightRef.current += 1;
      try {
        const next = await updateThemeRequest(color).finally(() => {
          inFlightRef.current -= 1;
        });
        if (seq !== seqRef.current) return;
        const stored = next?.themeColor ?? null;
        updateUser({ themeColor: stored });
        setPreview((p) => (p && p.userId === owner && p.color === stored ? null : p));
        showStatus("saved", successMessage);
      } catch {
        if (seq !== seqRef.current) return;
        setPreview(null);
        showStatus("error", failureMessage);
      }
    },
    [userId, updateUser, showStatus]
  );

  /** Live preview while dragging — nothing is sent. */
  const previewColor = useCallback(
    (color) => {
      const hex = normalizeHex(color);
      if (!hex || !userId) return;
      cancelPending();
      setPreview({ userId, color: hex });
    },
    [userId, cancelPending]
  );

  /** Preview and auto-save once the user has paused. */
  const commitColor = useCallback(
    (color, delay = SAVE_DELAY_MS) => {
      const hex = normalizeHex(color);
      if (!hex || !userId) return;
      cancelPending();
      setPreview({ userId, color: hex });
      if (hex === savedColor && !inFlightRef.current) {
        setPreview(null);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persist(hex, { successMessage: THEME_MESSAGES.saved, failureMessage: THEME_MESSAGES.saveFailed });
      }, delay);
    },
    [userId, savedColor, cancelPending, persist]
  );

  const resetToDefault = useCallback(async () => {
    if (!userId) return;
    cancelPending();
    setPreview({ userId, color: null });
    await persist(null, { successMessage: THEME_MESSAGES.reset, failureMessage: THEME_MESSAGES.resetFailed });
  }, [userId, cancelPending, persist]);

  const value = useMemo(
    () => ({
      savedColor,
      activeColor,
      isCustom: Boolean(activeColor),
      status,
      previewColor,
      commitColor,
      resetToDefault,
    }),
    [savedColor, activeColor, status, previewColor, commitColor, resetToDefault]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
