import { Router } from "express";
import rateLimit from "express-rate-limit";
import db, { transaction } from "../db.js";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";

/**
 * Nail measurements belong to the signed-in account only: no lookups or overwrites by phone number.
 * A save merges with the account's current measurements, so re-measuring two fingers keeps the other eight.
 */
const router = Router();

const FINGER_COLUMNS = `hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, created_at, photo_quality_score`;

const HAND_IDS = new Set(["right", "left"]);
const FINGER_IDS = new Set(["thumb", "index", "middle", "ring", "pinky"]);
const SAVED_STATUSES = new Set(["confirmed", "captured"]);
const COIN_ID_RE = /^[a-z0-9-]{1,40}$/;
/** Physically possible nail widths; anything outside is a marking mistake, not a measurement. */
const WIDTH_MM = { min: 4, max: 25 };
const SIZE = { min: 0, max: 15 };

const saveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `measure:${req.user.id}`,
  message: { error: "יותר מדי שמירות ברצף. אפשר לנסות שוב בעוד כמה דקות." },
});

function optionalNumber(value, { min, max, integer = false }) {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: integer ? Math.round(n) : Math.round(n * 100) / 100 };
}

/** Returns { entries } with only whitelisted, range-checked values, or { error }. */
export function validateMeasurements(measurements) {
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) {
    return { error: "measurements object is required" };
  }
  const raw = Object.values(measurements);
  if (raw.length === 0 || raw.length > 10) return { error: "measurements must have 1-10 fingers" };

  const seen = new Set();
  const entries = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return { error: "invalid finger entry" };
    const status = m.status ?? "confirmed";
    if (status === "pending") continue;
    if (!HAND_IDS.has(m.handId) || !FINGER_IDS.has(m.fingerId) || !SAVED_STATUSES.has(status)) {
      return { error: "invalid finger entry" };
    }
    const key = `${m.handId}-${m.fingerId}`;
    if (seen.has(key)) return { error: "duplicate finger" };
    seen.add(key);

    const width = optionalNumber(m.widthMm, WIDTH_MM);
    const size = optionalNumber(m.size, { ...SIZE, integer: true });
    const confidence = optionalNumber(m.confidence, { min: 0, max: 1 });
    const quality = optionalNumber(m.photoQualityScore ?? m.captureQuality?.score, { min: 0, max: 100, integer: true });
    if (!width.ok || !size.ok || !confidence.ok || !quality.ok) return { error: "value out of range" };
    const coinId = typeof m.coinId === "string" && COIN_ID_RE.test(m.coinId) ? m.coinId : null;

    entries.push({
      handId: m.handId,
      fingerId: m.fingerId,
      widthMm: width.value,
      size: size.value,
      confidence: confidence.value,
      coinId,
      manualOverride: Boolean(m.manualOverride),
      status,
      photoQualityScore: quality.value,
    });
  }
  if (!entries.length) return { error: "no measured fingers" };
  return { entries };
}

async function activeProfile(executor, userId) {
  const { rows } = await executor.query(
    `SELECT id, phone, coin_id, created_at, updated_at, is_active, user_id
       FROM measurement_profiles WHERE user_id = $1 AND is_active = 1
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function loadFingers(executor, profileId) {
  const { rows } = await executor.query(
    `SELECT ${FINGER_COLUMNS} FROM finger_measurements WHERE profile_id = $1 ORDER BY hand_id, finger_id`,
    [profileId]
  );
  return rows;
}

router.get(
  "/profile",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const profile = await activeProfile(db, req.user.id);
    if (!profile) return res.json(null);
    res.json({ ...profile, fingers: await loadFingers(db, profile.id) });
  })
);

router.post(
  "/profile",
  requireAuth,
  saveLimiter,
  asyncRoute(async (req, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { entries, error } = validateMeasurements(body.measurements);
    if (error) return res.status(400).json({ error });

    const userId = req.user.id;
    const coinId = typeof body.coinId === "string" && COIN_ID_RE.test(body.coinId) ? body.coinId : null;
    const phoneValue = `user-${userId}`;
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    const result = await transaction(async (tx) => {
      // Serialise saves per account so two tabs can't both become the active profile.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('measure:' || $1::text))`, [userId]);
      const previous = await activeProfile(tx, userId);
      const kept = previous
        ? (await loadFingers(tx, previous.id)).filter((f) => !entries.some((e) => e.handId === f.hand_id && e.fingerId === f.finger_id))
        : [];
      await tx.query(`UPDATE measurement_profiles SET is_active = 0 WHERE user_id = $1`, [userId]);

      const { rows } = await tx.query(
        `INSERT INTO measurement_profiles (phone, coin_id, consent_store_images, is_active, user_id)
         VALUES ($1, $2, 0, 1, $3) RETURNING id`,
        [phoneValue, coinId, userId]
      );
      const newId = rows[0].id;

      for (const f of kept) {
        await tx.query(
          `INSERT INTO finger_measurements
             (profile_id, hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, photo_quality_score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [newId, f.hand_id, f.finger_id, f.width_mm, f.size, f.confidence, f.coin_id, f.manual_override, f.status, f.photo_quality_score, f.created_at]
        );
      }
      for (const m of entries) {
        await tx.query(
          `INSERT INTO finger_measurements
             (profile_id, hand_id, finger_id, width_mm, size, confidence, coin_id, manual_override, status, photo_quality_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [newId, m.handId, m.fingerId, m.widthMm, m.size, m.confidence, m.coinId ?? coinId, m.manualOverride ? 1 : 0, m.status, m.photoQualityScore]
        );
      }

      await tx.query(`INSERT INTO measurement_links (token, profile_id, phone, expires_at) VALUES ($1, $2, $3, $4)`, [
        token,
        newId,
        phoneValue,
        expiresAt,
      ]);
      return { id: newId, fingerCount: kept.length + entries.length };
    });

    res.status(201).json({ id: result.id, userId, fingerCount: result.fingerCount, linkToken: token, expiresAt });
  })
);

/** Share-link status. Reveals nothing about the profile beyond whether the link still works. */
router.get(
  "/link/:token",
  asyncRoute(async (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(400).json({ error: "invalid token" });

    const { rows } = await db.query(`SELECT token, expires_at, revoked_at FROM measurement_links WHERE token = $1`, [token]);
    const link = rows[0];
    if (!link) return res.status(404).json({ error: "not found" });
    if (link.revoked_at) return res.status(410).json({ error: "revoked" });
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "expired" });
    }
    res.json({ token: link.token, expiresAt: link.expires_at });
  })
);

/** Only the account that owns the measurements can revoke its link. */
router.post(
  "/link/:token/revoke",
  requireAuth,
  asyncRoute(async (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(400).json({ error: "invalid token" });
    const { rowCount } = await db.query(
      `UPDATE measurement_links l SET revoked_at = now()
         FROM measurement_profiles p
        WHERE l.token = $1 AND l.revoked_at IS NULL AND p.id = l.profile_id AND p.user_id = $2`,
      [token, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  })
);

export default router;
