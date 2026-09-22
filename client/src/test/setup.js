/** Vitest setup — minimal DOM shims for camera lifecycle tests. */
Object.defineProperty(window, "isSecureContext", {
  configurable: true,
  get: () => true,
});
