import { Router } from "express";
import multer from "multer";
import FileType from "file-type";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { findUserById, publicUser } from "../auth.js";
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

const SHIPMENT_STATUS_HE = {
  preparing: "בהכנה",
  packed: "נארזה",
  shipped: "נשלחה",
  in_transit: "בדרך אלייך",
  out_for_delivery: "יצאה למסירה",
  delivered: "נמסרה",
  cancelled: "בוטלה",
};

const ORDER_STATUS_HE = {
  pending: "ממתינה",
  paid: "שולמה",
  processing: "בטיפול",
  shipped: "נשלחה",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

const FINGER_LABELS = {
  thumb: "אגודל",
  index: "אצבע",
  middle: "אמה",
  ring: "קמיצה",
  pinky: "זרת",
};

function mapMeasurementProfile(profile, fingers) {
  if (!profile) return null;
  const byHand = { right: [], left: [] };
  for (const f of fingers || []) {
    const hand = f.hand_id === "left" ? "left" : "right";
    byHand[hand].push({
      fingerId: f.finger_id,
      labelHe: FINGER_LABELS[f.finger_id] || f.finger_id,
      size: f.size,
      widthMm: f.width_mm,
      photoQualityScore: f.photo_quality_score ?? null,
      status: f.status,
      createdAt: f.created_at,
    });
  }
  return {
    id: profile.id,
    phone: profile.phone,
    coinId: profile.coin_id,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    hands: {
      right: { labelHe: "יד ימין", fingers: byHand.right },
      left: { labelHe: "יד שמאל", fingers: byHand.left },
    },
  };
}

router.get("/", requireAuth, (req, res) => {
  const row = findUserById(req.user.id);
  return res.json({ user: publicUser(row) });
});

router.patch("/", requireAuth, (req, res) => {
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

  const current = findUserById(req.user.id);
  db.prepare(
    `UPDATE users SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(firstName || current.first_name, lastName || current.last_name, req.user.id);

  return res.json({ user: publicUser(findUserById(req.user.id)) });
});

router.get("/measurements", requireAuth, (req, res) => {
  const profile = db
    .prepare(
      `SELECT id, phone, coin_id, created_at, updated_at, user_id
       FROM measurement_profiles
       WHERE user_id = ? AND is_active = 1
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(req.user.id);

  if (!profile) {
    return res.json({ measurement: null });
  }

  const fingers = db
    .prepare(
      `SELECT hand_id, finger_id, width_mm, size, confidence, coin_id, status,
              photo_quality_score, created_at
       FROM finger_measurements WHERE profile_id = ? ORDER BY hand_id, finger_id`
    )
    .all(profile.id);

  return res.json({ measurement: mapMeasurementProfile(profile, fingers) });
});

router.get("/orders", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, order_number, total_amount, currency, status, title_he, image_url, created_at, updated_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.id);

  const orders = rows.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    totalAmount: o.total_amount,
    currency: o.currency,
    status: o.status,
    statusHe: ORDER_STATUS_HE[o.status] || o.status,
    titleHe: o.title_he,
    imageUrl: o.image_url,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));

  return res.json({ orders });
});

router.get("/shipments", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id, s.order_id, s.carrier, s.tracking_number, s.tracking_url, s.status,
              s.shipped_at, s.delivered_at, s.updated_at, o.order_number
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE o.user_id = ?
       ORDER BY s.updated_at DESC LIMIT 50`
    )
    .all(req.user.id);

  const shipments = rows.map((s) => ({
    id: s.id,
    orderId: s.order_id,
    orderNumber: s.order_number,
    carrier: s.carrier,
    trackingNumber: s.tracking_number,
    trackingUrl: s.tracking_url,
    status: s.status,
    statusHe: SHIPMENT_STATUS_HE[s.status] || s.status,
    shippedAt: s.shipped_at,
    deliveredAt: s.delivered_at,
    updatedAt: s.updated_at,
  }));

  return res.json({ shipments });
});

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
      let mime = req.file?.mimetype || null;

      // Also accept data URL from camera capture
      if (!buffer && req.body?.imageDataUrl) {
        const m = String(req.body.imageDataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
        if (!m) {
          return res.status(400).json({ error: "פורמט תמונה לא תקין." });
        }
        mime = m[1].toLowerCase();
        buffer = Buffer.from(m[2], "base64");
      }

      if (!buffer) {
        return res.status(400).json({ error: "לא נבחרה תמונה." });
      }

      const detected = await FileType.fromBuffer(buffer);
      if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) {
        return res.status(400).json({ error: "סוג הקובץ אינו נתמך. אפשר JPEG, PNG או WebP." });
      }

      const previous = findUserById(req.user.id);
      const saved = await saveAvatarBuffer(buffer, detected.mime);

      db.prepare(`UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`).run(
        saved.publicUrl,
        req.user.id
      );

      if (previous?.avatar_url && previous.avatar_url !== saved.publicUrl) {
        await deleteAvatarByUrl(previous.avatar_url);
      }

      return res.json({ user: publicUser(findUserById(req.user.id)) });
    } catch (e) {
      if (e.code === "TOO_LARGE") {
        return res.status(400).json({ error: "הקובץ גדול מדי. עד 5MB." });
      }
      if (e.code === "UNSUPPORTED_MIME") {
        return res.status(400).json({ error: "סוג הקובץ אינו נתמך." });
      }
      console.error("avatar upload failed", e?.message);
      return res.status(500).json({ error: "לא הצלחנו לשמור את התמונה." });
    }
  });
});

router.delete("/avatar", requireAuth, async (req, res) => {
  try {
    const previous = findUserById(req.user.id);
    db.prepare(`UPDATE users SET avatar_url = NULL, updated_at = datetime('now') WHERE id = ?`).run(req.user.id);
    await deleteAvatarByUrl(previous?.avatar_url);
    return res.json({ user: publicUser(findUserById(req.user.id)) });
  } catch (e) {
    console.error("avatar delete failed", e?.message);
    return res.status(500).json({ error: "לא הצלחנו למחוק את התמונה." });
  }
});

export default router;
