import db from "./db.js";

/**
 * Staff-managed content pages. Content is plain text in typed sections (never HTML, CSS or scripts);
 * the client renders it with the site's own components, so every page gets the existing design automatically.
 */

/** Top-level paths used by the app, the API and static assets. Keep in sync with client/src/App.jsx routes. */
export const RESERVED_SLUGS = Object.freeze([
  "api", "login", "logout", "register", "profile", "admin", "booking", "services", "nail-sizing",
  "gallery", "build-a-set", "about", "home", "index", "p", "pages", "content", "uploads", "assets",
  "static", "public", "settings", "account", "robots", "sitemap", "favicon", "logo", "shades", "opencv",
]);

export const SECTION_TYPES = Object.freeze(["heading", "paragraph", "list", "image", "cta", "links"]);

const LIMITS = {
  title: 120,
  subtitle: 240,
  eyebrow: 40,
  seoTitle: 70,
  seoDescription: 160,
  sections: 40,
  heading: 120,
  paragraph: 3000,
  listItems: 20,
  listItem: 300,
  alt: 150,
  caption: 200,
  ctaLabel: 40,
  links: 10,
  linkLabel: 60,
  url: 500,
};

const PAGE_FIELDS = ["slug", "title", "subtitle", "eyebrow", "seoTitle", "seoDescription", "sections"];

class ContentValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = "CONTENT_VALIDATION";
  }
}

const invalid = (message) => {
  throw new ContentValidationError(message);
};

/** Plain text only: strips tags and control characters (newlines kept for paragraphs). */
export function cleanText(value, max, { multiline = false } = {}) {
  let text = String(value ?? "")
    .replace(/<\/?[a-zA-Z!?][^>]*>?/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "")
    .trim();
  if (multiline) text = text.replace(/\n{3,}/g, "\n\n");
  return text.slice(0, max);
}

/** Internal path, https URL, tel: or mailto:. Anything else (javascript:, data:, //host) is rejected. */
export function cleanHref(value) {
  const href = String(value ?? "").trim();
  if (!href || href.length > LIMITS.url) return null;
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

function cleanImageUrl(value) {
  const href = cleanHref(value);
  if (!href || href.startsWith("tel:") || href.startsWith("mailto:")) return null;
  return href;
}

function requireText(value, max, label, options) {
  const text = cleanText(value, max, options);
  if (!text) invalid(`יש למלא ${label}.`);
  return text;
}

function validateSection(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid(`מקטע ${index + 1} לא תקין.`);
  const { type } = raw;
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : {};
  const where = `במקטע ${index + 1}`;

  switch (type) {
    case "heading":
      return { type, data: { text: requireText(data.text, LIMITS.heading, `כותרת ${where}`) } };
    case "paragraph":
      return { type, data: { text: requireText(data.text, LIMITS.paragraph, `טקסט ${where}`, { multiline: true }) } };
    case "list": {
      const items = (Array.isArray(data.items) ? data.items : [])
        .map((item) => cleanText(item, LIMITS.listItem))
        .filter(Boolean)
        .slice(0, LIMITS.listItems);
      if (!items.length) invalid(`יש להוסיף לפחות פריט אחד לרשימה ${where}.`);
      return { type, data: { items, ordered: Boolean(data.ordered) } };
    }
    case "image": {
      const url = cleanImageUrl(data.url);
      if (!url) invalid(`כתובת התמונה ${where} צריכה להתחיל ב־https:// או ב־/.`);
      return {
        type,
        data: {
          url,
          alt: requireText(data.alt, LIMITS.alt, `תיאור לתמונה ${where}`),
          caption: cleanText(data.caption, LIMITS.caption),
        },
      };
    }
    case "cta": {
      const href = cleanHref(data.href);
      if (!href) invalid(`הקישור של הכפתור ${where} לא תקין.`);
      return {
        type,
        data: {
          label: requireText(data.label, LIMITS.ctaLabel, `טקסט לכפתור ${where}`),
          href,
          variant: data.variant === "ghost" ? "ghost" : "primary",
        },
      };
    }
    case "links": {
      const items = (Array.isArray(data.items) ? data.items : []).slice(0, LIMITS.links).map((item, i) => {
        const href = cleanHref(item?.href);
        if (!href) invalid(`קישור ${i + 1} ${where} לא תקין.`);
        return { label: requireText(item?.label, LIMITS.linkLabel, `טקסט לקישור ${i + 1} ${where}`), href };
      });
      if (!items.length) invalid(`יש להוסיף לפחות קישור אחד ${where}.`);
      return { type, data: { items } };
    }
    default:
      return invalid(`סוג מקטע לא מוכר ${where}.`);
  }
}

export function validateSlug(raw) {
  const slug = String(raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
    invalid("כתובת הדף יכולה להכיל אותיות באנגלית, מספרים ומקפים (2–60 תווים).");
  }
  if (RESERVED_SLUGS.includes(slug)) invalid("הכתובת הזו שמורה לאתר. אפשר לבחור כתובת אחרת.");
  return slug;
}

/** Whitelist + clean. `partial` allows PATCH bodies with only some fields. Unknown keys are rejected. */
export function validatePageInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("בקשה לא תקינה.");
  const unknown = Object.keys(body).filter((k) => !PAGE_FIELDS.includes(k));
  if (unknown.length) invalid("הבקשה כוללת שדות שלא ניתן לעדכן.");

  const out = {};
  if (!partial || "slug" in body) out.slug = validateSlug(body.slug);
  if (!partial || "title" in body) out.title = requireText(body.title, LIMITS.title, "כותרת לדף");
  if ("subtitle" in body) out.subtitle = cleanText(body.subtitle, LIMITS.subtitle);
  if ("eyebrow" in body) out.eyebrow = cleanText(body.eyebrow, LIMITS.eyebrow);
  if ("seoTitle" in body) out.seoTitle = cleanText(body.seoTitle, LIMITS.seoTitle);
  if ("seoDescription" in body) out.seoDescription = cleanText(body.seoDescription, LIMITS.seoDescription);
  if (!partial || "sections" in body) {
    const sections = body.sections ?? [];
    if (!Array.isArray(sections)) invalid("המקטעים לא תקינים.");
    if (sections.length > LIMITS.sections) invalid(`אפשר עד ${LIMITS.sections} מקטעים בדף.`);
    out.sections = sections.map(validateSection);
  }
  return out;
}

const PAGE_SELECT = `
  SELECT p.*, cu.first_name AS created_first, cu.last_name AS created_last,
         uu.first_name AS updated_first, uu.last_name AS updated_last
    FROM content_pages p
    LEFT JOIN users cu ON cu.id = p.created_by
    LEFT JOIN users uu ON uu.id = p.updated_by`;

function person(id, first, last) {
  return id ? { id, name: [first, last].filter(Boolean).join(" ") } : null;
}

function mapPage(row, sections) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    eyebrow: row.eyebrow,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    createdBy: person(row.created_by, row.created_first, row.created_last),
    updatedBy: person(row.updated_by, row.updated_first, row.updated_last),
    ...(sections ? { sections } : {}),
  };
}

async function loadSections(pageId, executor) {
  const { rows } = await executor.query(
    `SELECT type, data FROM content_page_sections WHERE page_id = $1 ORDER BY position`,
    [pageId]
  );
  return rows.map((r) => ({ type: r.type, data: r.data }));
}

async function replaceSections(pageId, sections, executor) {
  await executor.query(`DELETE FROM content_page_sections WHERE page_id = $1`, [pageId]);
  for (const [position, section] of sections.entries()) {
    await executor.query(
      `INSERT INTO content_page_sections (page_id, position, type, data) VALUES ($1, $2, $3, $4::jsonb)`,
      [pageId, position, section.type, JSON.stringify(section.data)]
    );
  }
}

export async function listPages(executor = db) {
  const { rows } = await executor.query(`${PAGE_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC, p.id DESC`);
  return rows.map((r) => mapPage(r));
}

export async function getPage(id, executor = db) {
  const { rows } = await executor.query(`${PAGE_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [id]);
  if (!rows[0]) return null;
  return mapPage(rows[0], await loadSections(id, executor));
}

/** Public view: published pages only, without editor metadata. */
export async function getPublishedPage(slug, executor = db) {
  const { rows } = await executor.query(
    `SELECT * FROM content_pages WHERE slug = $1 AND status = 'published' AND deleted_at IS NULL`,
    [slug]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    eyebrow: row.eyebrow,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    sections: await loadSections(row.id, executor),
  };
}

export async function createPage(input, userId, tx) {
  const { rows } = await tx.query(
    `INSERT INTO content_pages (slug, title, subtitle, eyebrow, seo_title, seo_description, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
    [
      input.slug,
      input.title,
      input.subtitle ?? "",
      input.eyebrow ?? "",
      input.seoTitle ?? "",
      input.seoDescription ?? "",
      userId,
    ]
  );
  await replaceSections(rows[0].id, input.sections || [], tx);
  return rows[0].id;
}

const COLUMN_FOR = { slug: "slug", title: "title", subtitle: "subtitle", eyebrow: "eyebrow", seoTitle: "seo_title", seoDescription: "seo_description" };

/** Returns false when the page does not exist (or was deleted). */
export async function updatePage(id, input, userId, tx) {
  const sets = [];
  const params = [];
  for (const [field, column] of Object.entries(COLUMN_FOR)) {
    if (field in input) {
      params.push(input[field]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(userId);
  sets.push(`updated_by = $${params.length}`, "updated_at = now()");
  params.push(id);
  const { rows } = await tx.query(
    `UPDATE content_pages SET ${sets.join(", ")} WHERE id = $${params.length} AND deleted_at IS NULL RETURNING id`,
    params
  );
  if (!rows.length) return false;
  if (input.sections) await replaceSections(id, input.sections, tx);
  return true;
}

export async function setPageStatus(id, status, userId, tx) {
  const { rows } = await tx.query(
    `UPDATE content_pages
        SET status = $1, updated_by = $2, updated_at = now(),
            published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING id`,
    [status, userId, id]
  );
  return rows.length > 0;
}

export async function softDeletePage(id, userId, tx) {
  const { rows } = await tx.query(
    `UPDATE content_pages SET deleted_at = now(), deleted_by = $2, status = 'draft', updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING id, slug`,
    [id, userId]
  );
  return rows[0] || null;
}

/** Copies a page as a new draft with a free "-copy" slug. Returns the new id, or null when the source is missing. */
export async function duplicatePage(id, userId, tx) {
  const source = await getPage(id, tx);
  if (!source) return null;
  const base = `${source.slug}-copy`.slice(0, 55);
  const { rows } = await tx.query(
    `SELECT slug FROM content_pages WHERE deleted_at IS NULL AND (slug = $1 OR slug LIKE $2)`,
    [base, `${base}-%`]
  );
  const taken = new Set(rows.map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
  return createPage({ ...source, slug, title: `${source.title} (עותק)`.slice(0, LIMITS.title) }, userId, tx);
}

export { ContentValidationError };
