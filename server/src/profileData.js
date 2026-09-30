import db from "./db.js";

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

export async function loadMeasurement(userId) {
  const { rows: profiles } = await db.query(
    `SELECT id, phone, coin_id, created_at, updated_at, user_id
     FROM measurement_profiles
     WHERE user_id = $1 AND is_active = 1
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  const profile = profiles[0];
  if (!profile) return null;

  const { rows: fingers } = await db.query(
    `SELECT hand_id, finger_id, width_mm, size, confidence, coin_id, status,
            photo_quality_score, created_at
     FROM finger_measurements WHERE profile_id = $1 ORDER BY hand_id, finger_id`,
    [profile.id]
  );
  return mapMeasurementProfile(profile, fingers);
}

export async function loadOrders(userId) {
  const { rows } = await db.query(
    `SELECT id, order_number, total_amount, currency, status, title_he, image_url, created_at, updated_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map((o) => ({
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
}

export async function loadShipments(userId) {
  const { rows } = await db.query(
    `SELECT s.id, s.order_id, s.carrier, s.tracking_number, s.tracking_url, s.status,
            s.shipped_at, s.delivered_at, s.updated_at, o.order_number
     FROM shipments s
     JOIN orders o ON o.id = s.order_id
     WHERE o.user_id = $1
     ORDER BY s.updated_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map((s) => ({
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
}
