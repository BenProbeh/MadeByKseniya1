import { Router } from "express";
import { transaction } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";
import { recordAudit } from "../roles.js";
import {
  createPage,
  duplicatePage,
  getPage,
  getPublishedPage,
  listPages,
  setPageStatus,
  softDeletePage,
  updatePage,
  validatePageInput,
} from "../contentPages.js";
import { parseUserId } from "./admin.js";

function reply(res, status, code, message) {
  return res.status(status).json({ success: false, code, error: message, errorMessage: message });
}

function handleContentError(res, err) {
  if (err?.code === "CONTENT_VALIDATION") return reply(res, 400, "VALIDATION_ERROR", err.message);
  if (err?.code === "23505") return reply(res, 409, "SLUG_TAKEN", "כבר יש דף עם הכתובת הזו. אפשר לבחור כתובת אחרת.");
  throw err;
}

const notFound = (res) => reply(res, 404, "NOT_FOUND", "הדף לא נמצא.");

/** /api/admin/content: owner and admins only. */
export const adminContentRouter = Router();
adminContentRouter.use(requireAdmin);

adminContentRouter.get(
  "/pages",
  asyncRoute(async (_req, res) => res.json({ success: true, pages: await listPages() }))
);

adminContentRouter.get(
  "/pages/:id",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    const page = id && (await getPage(id));
    if (!page) return notFound(res);
    return res.json({ success: true, page });
  })
);

adminContentRouter.post(
  "/pages",
  asyncRoute(async (req, res) => {
    try {
      const input = validatePageInput(req.body);
      const id = await transaction(async (tx) => {
        const newId = await createPage(input, req.user.id, tx);
        await recordAudit(tx, {
          actorUserId: req.user.id,
          action: "content_page_created",
          details: { pageId: newId, slug: input.slug },
        });
        return newId;
      });
      return res.status(201).json({ success: true, page: await getPage(id) });
    } catch (err) {
      return handleContentError(res, err);
    }
  })
);

adminContentRouter.patch(
  "/pages/:id",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return notFound(res);
    try {
      const input = validatePageInput(req.body, { partial: true });
      const found = await transaction(async (tx) => {
        if (!(await updatePage(id, input, req.user.id, tx))) return false;
        await recordAudit(tx, {
          actorUserId: req.user.id,
          action: "content_page_updated",
          details: { pageId: id, fields: Object.keys(input) },
        });
        return true;
      });
      if (!found) return notFound(res);
      return res.json({ success: true, page: await getPage(id) });
    } catch (err) {
      return handleContentError(res, err);
    }
  })
);

for (const [path, status, action] of [
  ["publish", "published", "content_page_published"],
  ["unpublish", "draft", "content_page_unpublished"],
]) {
  adminContentRouter.post(
    `/pages/:id/${path}`,
    asyncRoute(async (req, res) => {
      const id = parseUserId(req.params.id);
      if (!id) return notFound(res);
      const found = await transaction(async (tx) => {
        if (!(await setPageStatus(id, status, req.user.id, tx))) return false;
        await recordAudit(tx, { actorUserId: req.user.id, action, details: { pageId: id } });
        return true;
      });
      if (!found) return notFound(res);
      return res.json({ success: true, page: await getPage(id) });
    })
  );
}

adminContentRouter.post(
  "/pages/:id/duplicate",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return notFound(res);
    const newId = await transaction(async (tx) => {
      const created = await duplicatePage(id, req.user.id, tx);
      if (created) {
        await recordAudit(tx, {
          actorUserId: req.user.id,
          action: "content_page_duplicated",
          details: { pageId: created, sourcePageId: id },
        });
      }
      return created;
    });
    if (!newId) return notFound(res);
    return res.status(201).json({ success: true, page: await getPage(newId) });
  })
);

adminContentRouter.delete(
  "/pages/:id",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return notFound(res);
    const deleted = await transaction(async (tx) => {
      const row = await softDeletePage(id, req.user.id, tx);
      if (row) {
        await recordAudit(tx, {
          actorUserId: req.user.id,
          action: "content_page_deleted",
          details: { pageId: id, slug: row.slug, mode: "soft" },
        });
      }
      return row;
    });
    if (!deleted) return notFound(res);
    return res.json({ success: true });
  })
);

/** /api/content: published pages for signed-in visitors (the whole site sits behind login). */
export const publicContentRouter = Router();

publicContentRouter.get(
  "/pages/:slug",
  requireAuth,
  asyncRoute(async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return notFound(res);
    const page = await getPublishedPage(slug);
    if (!page) return notFound(res);
    return res.json({ success: true, page });
  })
);
