import { Router } from "express";
import multer from "multer";
import FileType from "file-type";
import db, { transaction } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { findUserById, publicUser } from "../auth.js";
import { asyncRoute, sendServiceUnavailable } from "../http.js";
import { loadMeasurement, loadOrders, loadShipments } from "../profileData.js";
import {
  deleteAvatarByUrl,
  getMaxAvatarBytes,
  saveAvatarBuffer,
} from "../storage/avatarStorage.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxAvatarBytes(), files: 1 },
});

router.get(
  "/",
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await findUserById(req.user.id);
    return res.json({ user: publicUser(row) });
  })
);

router.patch(
  "/",
  requireAuth,
  asyncRoute(async (req, res) => {
    const firstName = String(req.body?.firstName ?? "").trim();
    const lastName = String(req.body?.lastName ?? "").trim();
    if (firstName && firstName.length < 2) {
      return res.status(400).json({ error: "שם פרטי קצר מדי." });
    }
    if (lastName && lastName.length < 2) {
      return res.status(400).json({ error: "שם משפחה קצר מדי." });
    }
    if (firstName.length > 60 || lastName.length > 60) {
      return res.status(400).json({ error: "השם ארוך מדי." });
    }

    const { rows } = await db.query(
      `UPDATE users
          SET first_name = COALESCE(NULLIF($1, ''), first_name),
              last_name = COALESCE(NULLIF($2, ''), last_name),
              updated_at = now()
        WHERE id = $3
       RETURNING *`,
      [firstName, lastName, req.user.id]
    );

    return res.json({ user: publicUser(rows[0]) });
  })
);

router.get(
  "/measurements",
  requireAuth,
  asyncRoute(async (req, res) => {
    return res.json({ measurement: await loadMeasurement(req.user.id) });
  })
);

router.get(
  "/orders",
  requireAuth,
  asyncRoute(async (req, res) => {
    return res.json({ orders: await loadOrders(req.user.id) });
  })
);

router.get(
  "/shipments",
  requireAuth,
  asyncRoute(async (req, res) => {
    return res.json({ shipments: await loadShipments(req.user.id) });
  })
);

router.post("/avatar", requireAuth, (req, res) => {
  upload.single("avatar")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "הקובץ גדול מדי. עד 5MB." });
      }
      return res.status(400).json({ error: "לא הצלחנו לקבל את התמונה." });
    }
    try {
      let buffer = req.file?.buffer || null;

      // Also accept data URL from camera capture
      if (!buffer && req.body?.imageDataUrl) {
        const m = String(req.body.imageDataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
        if (!m) {
          return res.status(400).json({ error: "פורמט תמונה לא תקין." });
        }
        buffer = Buffer.from(m[2], "base64");
      }

      if (!buffer) {
        return res.status(400).json({ error: "לא נבחרה תמונה." });
      }

      const detected = await FileType.fromBuffer(buffer);
      if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) {
        return res.status(400).json({ error: "סוג הקובץ אינו נתמך. אפשר JPEG, PNG או WebP." });
      }

      const row = await transaction(async (tx) => {
        const previous = await findUserById(req.user.id, tx);
        const saved = await saveAvatarBuffer(buffer, detected.mime, req.user.id, tx);
        const { rows } = await tx.query(
          `UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2 RETURNING *`,
          [saved.publicUrl, req.user.id]
        );
        if (previous?.avatar_url && previous.avatar_url !== saved.publicUrl) {
          await deleteAvatarByUrl(previous.avatar_url, tx);
        }
        return rows[0];
      });

      return res.json({ user: publicUser(row) });
    } catch (e) {
      if (e.code === "TOO_LARGE") {
        return res.status(400).json({ error: "הקובץ גדול מדי. עד 5MB." });
      }
      if (e.code === "UNSUPPORTED_MIME") {
        return res.status(400).json({ error: "סוג הקובץ אינו נתמך." });
      }
      if (e.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      console.error("avatar upload failed", e?.message);
      return res.status(500).json({ error: "לא הצלחנו לשמור את התמונה." });
    }
  });
});

router.delete(
  "/avatar",
  requireAuth,
  asyncRoute(async (req, res) => {
    try {
      const row = await transaction(async (tx) => {
        const previous = await findUserById(req.user.id, tx);
        const { rows } = await tx.query(
          `UPDATE users SET avatar_url = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
          [req.user.id]
        );
        await deleteAvatarByUrl(previous?.avatar_url, tx);
        return rows[0];
      });
      return res.json({ user: publicUser(row) });
    } catch (e) {
      if (e.code === "DB_UNAVAILABLE") return sendServiceUnavailable(res);
      console.error("avatar delete failed", e?.message);
      return res.status(500).json({ error: "לא הצלחנו למחוק את התמונה." });
    }
  })
);

export default router;
