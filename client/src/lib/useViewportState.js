import { useEffect } from "react";

const TEXT_INPUT = /^(INPUT|TEXTAREA|SELECT)$/;
const NON_TEXT_TYPES = new Set(["checkbox", "radio", "range", "button", "submit", "file", "color"]);

function isTextControl(el) {
  if (!el || !TEXT_INPUT.test(el.tagName)) return el?.isContentEditable === true;
  return el.tagName !== "INPUT" || !NON_TEXT_TYPES.has(el.type);
}

/**
 * Marks <html data-keyboard="open"> while a text field is focused on a touch device, so fixed bottom bars
 * step aside instead of floating above the on-screen keyboard and covering the field or its button.
 */
export function useKeyboardAwareness() {
  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)");
    const root = document.documentElement;
    let timer = 0;

    function update() {
      window.clearTimeout(timer);
      // Moving focus between fields fires focusout then focusin; wait a tick before closing.
      timer = window.setTimeout(() => {
        const open = Boolean(coarse?.matches) && isTextControl(document.activeElement);
        if (open) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
      }, 60);
    }

    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.keyboard;
    };
  }, []);
}

/** Full-screen flows (the camera) hide the tab bar while `active`. */
export function useImmersive(active) {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.documentElement;
    root.dataset.immersive = "true";
    return () => {
      delete root.dataset.immersive;
    };
  }, [active]);
}
