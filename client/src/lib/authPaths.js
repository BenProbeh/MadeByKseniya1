export const AFTER_AUTH_PATH = "/services";

/** Sign-in, sign-up and verification screens; they never show the site navigation. */
export const AUTH_PAGES = Object.freeze(["/login", "/register", "/forgot-password", "/verify-email", "/account/email"]);

/** Only same-site paths that aren't auth screens, so a crafted `from` can't redirect elsewhere. */
export function safeInternalPath(path) {
  if (typeof path !== "string") return AFTER_AUTH_PATH;
  if (!path.startsWith("/") || path.startsWith("//")) return AFTER_AUTH_PATH;
  if (path === "/" || AUTH_PAGES.includes(path)) return AFTER_AUTH_PATH;
  return path;
}
