import { Router } from "express";
import db from "../db.js";
import crypto from "node:crypto";

const router = Router();

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.startsWith("972")) return digits.length >= 11 && digits.length <= 12;
  return /^0\d{8,9}$/.test(digits);
}

router.get("/profile", (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "valid phone is required" });
  }

  const profile = db
    .prepare(
      `SELECT id, phone, coin_id, created_at, updated_at, is_active
       FROM measurement_profiles WHERE phone = ? AND is_active = 1
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(phone);

  if (!profile) return res.json(null);

  const fingers = db
    .prepare(
      `SELECT hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, created_at
       FROM finger_measurements WHERE profile_id = ? ORDER BY hand_id, finger_id`
    )
    .all(profile.id);

  res.json({ ...profile, fingers });
});

router.post("/profile", (req, res) => {
  const { phone, coinId, measurements, consentStoreImages = false } = req.body || {};
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return res.status(400).json({ error: "valid phone is required" });
  }
  if (!measurements || typeof measurements !== "object") {
    return res.status(400).json({ error: "measurements object is required" });
  }

  const entries = Object.values(measurements);
  if (entries.length === 0) {
    return res.status(400).json({ error: "measurements cannot be empty" });
  }

  try {
    db.exec("BEGIN");

    // deactivate previous active profiles for this phone
    db.prepare(`UPDATE measurement_profiles SET is_active = 0 WHERE phone = ?`).run(normalized);

    const insertProfile = db.prepare(
      `INSERT INTO measurement_profiles (phone, coin_id, consent_store_images, is_active)
       VALUES (?, ?, ?, 1)`
    );
    const result = insertProfile.run(normalized, coinId ?? null, consentStoreImages ? 1 : 0);
    const profileId = result.lastInsertRowid;

    const insertFinger = db.prepare(
      `INSERT INTO finger_measurements
        (profile_id, hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, capture_quality_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const m of entries) {
      if (!m?.handId || !m?.fingerId) continue;
      insertFinger.run(
        profileId,
        m.handId,
        m.fingerId,
        m.widthMm ?? null,
        m.size ?? null,
        m.confidence ?? null,
        m.coinId ?? coinId ?? null,
        m.manualOverride ? 1 : 0,
        m.status ?? "confirmed",
        m.captureQuality ? JSON.stringify(m.captureQuality) : null
      );
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    db.prepare(
      `INSERT INTO measurement_links (token, profile_id, phone, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run(token, profileId, normalized, expiresAt);

    db.exec("COMMIT");

    res.status(201).json({
      id: profileId,
      phone: normalized,
      linkToken: token,
      expiresAt,
    });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/link/:token", (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return res.status(400).json({ error: "invalid token" });
  }

  const link = db
    .prepare(
      `SELECT token, profile_id, phone, expires_at, revoked_at
       FROM measurement_links WHERE token = ?`
    )
    .get(token);

  if (!link) return res.status(404).json({ error: "not found" });
  if (link.revoked_at) return res.status(410).json({ error: "revoked" });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: "expired" });
  }

  // Do not expose full profile to anonymous link consumers without extra checks.
  // Return only enough to open the sizing flow bound to this phone hash-less phone.
  res.json({
    token: link.token,
    phoneHint: link.phone.slice(0, 3) + "****" + link.phone.slice(-2),
    profileId: link.profile_id,
    expiresAt: link.expires_at,
  });
});

router.post("/link/:token/revoke", (req, res) => {
  const token = String(req.params.token || "");
  const info = db
    .prepare(`UPDATE measurement_links SET revoked_at = datetime('now') WHERE token = ? AND revoked_at IS NULL`)
    .run(token);
  if (!info.changes) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
