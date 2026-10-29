import { AUTH_PAGES } from "./authPaths.js";

/** Customer tabs (bottom bar on phones, top links on desktop). */
export const CUSTOMER_TABS = Object.freeze([
  { to: "/", label: "בית", icon: "home", match: (p) => p === "/" },
  { to: "/nail-sizing", label: "מדידה", icon: "measure", match: (p) => p.startsWith("/nail-sizing") },
  { to: "/appointments", label: "תורים", icon: "appointments", match: (p) => p === "/appointments" || p === "/booking" },
  { to: "/profile", label: "פרופיל", icon: "profile", match: (p) => p.startsWith("/profile") },
]);

/** Staff tabs inside the management area. */
export const STAFF_TABS = Object.freeze([
  { to: "/admin", label: "סקירה", icon: "dashboard", match: (p) => p === "/admin" || p === "/admin/notifications" },
  { to: "/admin/appointments", label: "תורים", icon: "appointments", match: (p) => p.startsWith("/admin/appointments"), badge: "pending" },
  { to: "/admin/customers", label: "לקוחות", icon: "customers", match: (p) => p.startsWith("/admin/customers") },
  { to: "/admin/more", label: "עוד", icon: "more", match: (p) => p === "/admin/more" || p.startsWith("/admin/content") },
]);

/** Routes without the app chrome (no tab bar, no top bar links). */
export function isChromeless(pathname) {
  return AUTH_PAGES.includes(pathname) || pathname === "/appointments/confirm";
}

export function isStaffArea(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

const NESTED = [
  { test: (p) => /^\/services\/[^/]+$/.test(p), back: "/services", title: "פרטי המסלול" },
  { test: (p) => p === "/services", back: "/", title: "המסלולים" },
  { test: (p) => p === "/gallery", back: "/", title: "גלריה" },
  { test: (p) => p === "/build-a-set", back: "/", title: "עצבי סט" },
  { test: (p) => p === "/booking", back: "/appointments", title: "קביעת תור" },
  { test: (p) => /^\/admin\/customers\/[^/]+$/.test(p), back: "/admin/customers", title: "כרטיס לקוחה" },
  { test: (p) => p === "/admin/notifications", back: "/admin", title: "התראות" },
  { test: (p) => p === "/admin/content", back: "/admin/more", title: "ניהול תוכן" },
  { test: (p) => /^\/admin\/content\/[^/]+$/.test(p), back: "/admin/content", title: "עריכת עמוד" },
];

const TOP_LEVEL = new Set(["/", "/nail-sizing", "/appointments", "/profile", "/admin", "/admin/appointments", "/admin/customers", "/admin/more"]);

/**
 * App-bar metadata for a path: a back target for nested screens (null on top-level tabs).
 * Unknown single-segment paths are content pages and go back home.
 */
export function routeMeta(pathname) {
  const nested = NESTED.find((n) => n.test(pathname));
  if (nested) return { back: nested.back, title: nested.title };
  if (TOP_LEVEL.has(pathname)) return { back: null, title: "" };
  if (/^\/[^/]+$/.test(pathname)) return { back: "/", title: "" };
  return { back: null, title: "" };
}
