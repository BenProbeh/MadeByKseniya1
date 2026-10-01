/** Client mirror of server/src/contentPages.js rules (the server re-validates and cleans everything). */

export const SECTION_TYPES = [
  { type: "heading", label: "כותרת" },
  { type: "paragraph", label: "פסקה" },
  { type: "list", label: "רשימה" },
  { type: "image", label: "תמונה" },
  { type: "cta", label: "כפתור" },
  { type: "links", label: "קישורים" },
];

export const RESERVED_SLUGS = [
  "api", "login", "logout", "register", "profile", "admin", "booking", "services", "nail-sizing",
  "gallery", "build-a-set", "about", "home", "index", "p", "pages", "content", "uploads", "assets",
  "static", "public", "settings", "account", "robots", "sitemap", "favicon", "logo", "shades", "opencv",
];

/** Internal path, https URL, tel: or mailto:. Anything else (javascript:, data:, //host) returns null. */
export function safeHref(value) {
  const href = String(value ?? "").trim();
  if (!href || href.length > 500) return null;
  if (/^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*$/.test(href)) return href;
  if (/^tel:\+?[0-9-]{6,20}$/.test(href)) return href;
  if (/^mailto:[^\s<>"'@]+@[^\s<>"'@]+\.[a-z]{2,}$/i.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "https:" && !/["'<>\s]/.test(href)) return url.toString();
  } catch {
    /* not a URL */
  }
  return null;
}

export function safeImageUrl(value) {
  const href = safeHref(value);
  return href && !href.startsWith("tel:") && !href.startsWith("mailto:") ? href : null;
}

export function slugProblem(raw) {
  const slug = String(raw ?? "").trim().toLowerCase();
  if (!slug) return "יש לבחור כתובת לדף.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
    return "כתובת הדף יכולה להכיל אותיות באנגלית, מספרים ומקפים (2–60 תווים).";
  }
  if (RESERVED_SLUGS.includes(slug)) return "הכתובת הזו שמורה לאתר. אפשר לבחור כתובת אחרת.";
  return "";
}

export function emptySection(type) {
  switch (type) {
    case "heading":
    case "paragraph":
      return { type, data: { text: "" } };
    case "list":
      return { type, data: { items: [""], ordered: false } };
    case "image":
      return { type, data: { url: "", alt: "", caption: "" } };
    case "cta":
      return { type, data: { label: "", href: "/booking", variant: "primary" } };
    case "links":
      return { type, data: { items: [{ label: "", href: "" }] } };
    default:
      return null;
  }
}
