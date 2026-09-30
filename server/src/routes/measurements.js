import { Router } from "express";
import db, { transaction } from "../db.js";
import crypto from "node:crypto";
import { optionalAuth } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";

const router = Router();

const FINGER_COLUMNS = `hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, created_at, photo_quality_score`;

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.startsWith("972")) return digits.length >= 11 && digits.length <= 12;
  return /^0\d{8,9}$/.test(digits);
}

async function loadFingers(profileId) {
  const { rows } = await db.query(
    `SELECT ${FINGER_COLUMNS} FROM finger_measurements WHERE profile_id = $1 ORDER BY hand_id, finger_id`,
    [profileId]
  );
  return rows;
}

router.get(
  "/profile",
  optionalAuth,
  asyncRoute(async (req, res) => {
    // Authenticated: prefer user-linked profile
    if (req.user) {
      const { rows } = await db.query(
        `SELECT id, phone, coin_id, created_at, updated_at, is_active, user_id
         FROM measurement_profiles WHERE user_id = $1 AND is_active = 1
         ORDER BY updated_at DESC, id DESC LIMIT 1`,
        [req.user.id]
      );
      if (rows[0]) {
        return res.json({ ...rows[0], fingers: await loadFingers(rows[0].id) });
      }
    }

    const phone = normalizePhone(req.query.phone);
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "valid phone is required" });
    }

    const { rows } = await db.query(
      `SELECT id, phone, coin_id, created_at, updated_at, is_active, user_id
       FROM measurement_profiles WHERE phone = $1 AND is_active = 1
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [phone]
    );
    const profile = rows[0];

    if (!profile) return res.json(null);

    // Never expose another user's linked profile via phone lookup if user_id set
    // and requester is a different authenticated user
    if (profile.user_id && req.user && profile.user_id !== req.user.id) {
      return res.json(null);
    }

    res.json({ ...profile, fingers: await loadFingers(profile.id) });
  })
);

router.post(
  "/profile",
  optionalAuth,
  asyncRoute(async (req, res) => {
    const { phone, coinId, measurements, consentStoreImages = false } = req.body || {};
    const normalized = normalizePhone(phone);
    const userId = req.user?.id || null;

    // Authed users may save without phone; phone still preferred when provided
    if (!userId && !isValidPhone(normalized)) {
      return res.status(400).json({ error: "valid phone is required" });
    }
    if (!measurements || typeof measurements !== "object") {
      return res.status(400).json({ error: "measurements object is required" });
    }

    const entries = Object.values(measurements);
    if (entries.length === 0) {
      return res.status(400).json({ error: "measurements cannot be empty" });
    }

    const phoneValue = isValidPhone(normalized) ? normalized : userId ? `user-${userId}` : "";
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    const profileId = await transaction(async (tx) => {
      if (userId) {
        await tx.query(`UPDATE measurement_profiles SET is_active = 0 WHERE user_id = $1`, [userId]);
      }
      if (isValidPhone(normalized)) {
        await tx.query(`UPDATE measurement_profiles SET is_active = 0 WHERE phone = $1`, [normalized]);
      }

      const { rows } = await tx.query(
        `INSERT INTO measurement_profiles (phone, coin_id, consent_store_images, is_active, user_id)
         VALUES ($1, $2, $3, 1, $4) RETURNING id`,
        [phoneValue, coinId ?? null, consentStoreImages ? 1 : 0, userId]
      );
      const newId = rows[0].id;

      for (const m of entries) {
        if (!m?.handId || !m?.fingerId) continue;
        const qualityScore = m.photoQualityScore ?? m.captureQuality?.score ?? null;
        await tx.query(
          `INSERT INTO finger_measurements
            (profile_id, hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, capture_quality_json, photo_quality_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newId,
            m.handId,
            m.fingerId,
            m.widthMm ?? null,
            m.size ?? null,
            m.confidence ?? null,
            m.coinId ?? coinId ?? null,
            m.manualOverride ? 1 : 0,
            m.status ?? "confirmed",
            m.captureQuality ? JSON.stringify(m.captureQuality) : null,
            qualityScore == null ? null : Math.round(Number(qualityScore)),
          ]
        );
      }

      await tx.query(
        `INSERT INTO measurement_links (token, profile_id, phone, expires_at) VALUES ($1, $2, $3, $4)`,
        [token, newId, phoneValue, expiresAt]
      );
      return newId;
    });

    res.status(201).json({
      id: profileId,
      phone: phoneValue,
      userId,
      linkToken: token,
      expiresAt,
    });
  })
);

router.get(
  "/link/:token",
  asyncRoute(async (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{32,128}$/i.test(token)) {
      return res.status(400).json({ error: "invalid token" });
    }

    const { rows } = await db.query(
      `SELECT token, profile_id, phone, expires_at, revoked_at
       FROM measurement_links WHERE token = $1`,
      [token]
    );
    const link = rows[0];

    if (!link) return res.status(404).json({ error: "not found" });
    if (link.revoked_at) return res.status(410).json({ error: "revoked" });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "expired" });
    }

    res.json({
      token: link.token,
      phoneHint: link.phone.slice(0, 3) + "****" + link.phone.slice(-2),
      profileId: link.profile_id,
      expiresAt: link.expires_at,
    });
  })
);

router.post(
  "/link/:token/revoke",
  asyncRoute(async (req, res) => {
    const token = String(req.params.token || "");
    const { rowCount } = await db.query(
      `UPDATE measurement_links SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL`,
      [token]
    );
    if (!rowCount) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  })
);

export default router;
