import { catalogPriceRange } from "./packageCatalog.js";

/**
 * Internal customer score (0-100), visible to owner/admin only. It never changes prices, availability or rights.
 * Inputs are business activity only: bookings (status, service kind, price, date) and orders (status, amount, date).
 * It never uses profile pictures, personal attributes, measurements or free-text notes.
 *
 * "Completed" = a booking whose time has passed and that was not cancelled (the site records cancellations,
 * but has no separate attendance / no-show status yet).
 */
export const SCORE_WEIGHTS = Object.freeze({
  bookings: { max: 30, frequency: 20, attendance: 10 },
  builds: { max: 25, volume: 15, rhythm: 10 },
  value: { max: 20 },
  revenue: { max: 15 },
  recency: { max: 10 },
});

export const SCORE_RULES = Object.freeze({
  /** Non-cancelled bookings in the last 180 days (plus the next 60) for full frequency points: about one every two weeks. */
  bookingsForFullFrequency: 12,
  /** Completed full builds in the last 90 days for full build-volume points: about one every two weeks. */
  buildsForFullVolume: 6,
  /** Ideal gap between consecutive builds (days); points fall linearly to zero at +/- this many days. */
  idealBuildGapDays: 14,
  /** Lifetime spend (ILS) for full revenue points. */
  revenueForFullPointsIls: 3000,
  /** Days since last activity -> recency points (first match wins). */
  recencySteps: [
    [14, 10],
    [30, 7],
    [60, 4],
    [120, 2],
  ],
  paidOrderStatuses: ["paid", "processing", "shipped", "completed"],
});

export const SCORE_TIERS = Object.freeze([
  { tier: "top", min: 75 },
  { tier: "high", min: 50 },
  { tier: "medium", min: 25 },
  { tier: "low", min: 0 },
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round1 = (x) => Math.round(x * 10) / 10;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function tierForScore(score) {
  return SCORE_TIERS.find((t) => score >= t.min).tier;
}

/**
 * @param {{ appointments: {status: string, kind: string|null, priceIls: number|null, startsAt: Date|string}[],
 *           orders: {status: string, totalAgorot: number, createdAt: Date|string}[] }} activity
 * @param {Date} now
 */
export function computeCustomerScore({ appointments = [], orders = [] }, now = new Date()) {
  const nowMs = now.getTime();
  const appts = appointments
    .map((a) => ({ ...a, t: new Date(a.startsAt).getTime() }))
    .filter((a) => Number.isFinite(a.t));
  // Requests still waiting for a decision, and rejected ones, don't count as bookings.
  const cancelled = appts.filter((a) => a.status === "cancelled");
  const active = appts.filter((a) => a.status === "confirmed");
  const completed = active.filter((a) => a.t <= nowMs);

  const since = (days) => nowMs - days * DAY_MS;

  // 1. Booking frequency + attendance consistency
  const recentBookings = active.filter((a) => a.t >= since(180) && a.t <= nowMs + 60 * DAY_MS).length;
  const frequencyPts = clamp01(recentBookings / SCORE_RULES.bookingsForFullFrequency) * SCORE_WEIGHTS.bookings.frequency;
  const decided = completed.length + cancelled.length;
  const attendancePts = decided ? (completed.length / decided) * SCORE_WEIGHTS.bookings.attendance : 0;

  // 2. Full builds: volume in the last 90 days + a steady ~2-week rhythm
  const builds = completed.filter((a) => a.kind === "build");
  const builds90 = builds.filter((a) => a.t >= since(90)).length;
  const buildVolumePts = clamp01(builds90 / SCORE_RULES.buildsForFullVolume) * SCORE_WEIGHTS.builds.volume;
  const buildTimes = builds.filter((a) => a.t >= since(180)).map((a) => a.t).sort((a, b) => a - b);
  let medianGapDays = null;
  let rhythmPts = 0;
  if (buildTimes.length >= 2) {
    const gaps = buildTimes.slice(1).map((t, i) => (t - buildTimes[i]) / DAY_MS);
    medianGapDays = median(gaps);
    const ideal = SCORE_RULES.idealBuildGapDays;
    rhythmPts = clamp01(1 - Math.abs(medianGapDays - ideal) / ideal) * SCORE_WEIGHTS.builds.rhythm;
  }

  // 3. Package value: average price of non-cancelled bookings, scaled across the catalog range
  const priced = active.filter((a) => Number.isFinite(a.priceIls) && a.priceIls > 0);
  const { min, max } = catalogPriceRange();
  const avgPrice = priced.length ? priced.reduce((s, a) => s + a.priceIls, 0) / priced.length : null;
  const valuePts = avgPrice == null ? 0 : clamp01((avgPrice - min) / (max - min)) * SCORE_WEIGHTS.value.max;

  // 4. Lifetime revenue: completed bookings + paid orders
  const paidOrders = orders.filter((o) => SCORE_RULES.paidOrderStatuses.includes(o.status));
  const revenueIls =
    completed.reduce((s, a) => s + (Number.isFinite(a.priceIls) ? a.priceIls : 0), 0) +
    paidOrders.reduce((s, o) => s + (Number(o.totalAgorot) || 0) / 100, 0);
  const revenuePts = clamp01(revenueIls / SCORE_RULES.revenueForFullPointsIls) * SCORE_WEIGHTS.revenue.max;

  // 5. Recency of the last real activity
  const activityTimes = [
    ...completed.map((a) => a.t),
    ...paidOrders.map((o) => new Date(o.createdAt).getTime()).filter(Number.isFinite),
  ];
  const lastActivityMs = activityTimes.length ? Math.max(...activityTimes) : null;
  const daysSinceActivity = lastActivityMs == null ? null : Math.floor((nowMs - lastActivityMs) / DAY_MS);
  const recencyPts =
    daysSinceActivity == null ? 0 : SCORE_RULES.recencySteps.find(([days]) => daysSinceActivity <= days)?.[1] ?? 0;

  const parts = [
    {
      key: "bookings",
      label: "תדירות תורים והגעה",
      points: round1(frequencyPts + attendancePts),
      max: SCORE_WEIGHTS.bookings.max,
      detail: `${recentBookings} תורים בחצי השנה האחרונה · ${completed.length} הושלמו · ${cancelled.length} בוטלו`,
    },
    {
      key: "builds",
      label: "בנייה מלאה בקביעות",
      points: round1(buildVolumePts + rhythmPts),
      max: SCORE_WEIGHTS.builds.max,
      detail:
        medianGapDays == null
          ? `${builds90} בניות ב־90 הימים האחרונים`
          : `${builds90} בניות ב־90 הימים האחרונים · בממוצע כל ${Math.round(medianGapDays)} ימים`,
    },
    {
      key: "value",
      label: "מסלולים שנבחרו",
      points: round1(valuePts),
      max: SCORE_WEIGHTS.value.max,
      detail: avgPrice == null ? "אין עדיין מסלולים עם מחיר" : `מחיר ממוצע למסלול: ${Math.round(avgPrice)} ₪`,
    },
    {
      key: "revenue",
      label: "רכישות מצטברות",
      points: round1(revenuePts),
      max: SCORE_WEIGHTS.revenue.max,
      detail: `${Math.round(revenueIls)} ₪ בסך הכול`,
    },
    {
      key: "recency",
      label: "פעילות אחרונה",
      points: recencyPts,
      max: SCORE_WEIGHTS.recency.max,
      detail: daysSinceActivity == null ? "אין עדיין פעילות" : `לפני ${daysSinceActivity} ימים`,
    },
  ];

  const score = Math.max(0, Math.min(100, Math.round(parts.reduce((s, p) => s + p.points, 0))));
  const insufficientData = appts.length === 0 && orders.length === 0;
  return {
    score,
    tier: insufficientData ? "low" : tierForScore(score),
    insufficientData,
    lastActivityAt: lastActivityMs == null ? null : new Date(lastActivityMs).toISOString(),
    breakdown: parts,
  };
}

/** Re-compute and store scores for the given users (all active users when userIds is null). */
export async function refreshCustomerScores(executor, { userIds = null, now = new Date() } = {}) {
  const filter = userIds ? `AND u.id = ANY($1::int[])` : "";
  const params = userIds ? [userIds] : [];

  const users = await executor.query(`SELECT u.id FROM users u WHERE u.deleted_at IS NULL ${filter}`, params);
  if (!users.rows.length) return 0;

  const appts = await executor.query(
    `SELECT u.id AS user_id, a.status,
            COALESCE(a.service_kind, s.kind) AS kind,
            COALESCE(a.price_ils, s.price_ils) AS price_ils,
            ((a.date || ' ' || a.time)::timestamp AT TIME ZONE 'Asia/Jerusalem') AS starts_at
       FROM users u
       JOIN appointments a
         ON a.user_id = u.id
         OR (a.user_id IS NULL AND a.phone_e164 IS NOT NULL AND a.phone_e164 = u.phone_e164)
       JOIN services s ON s.id = a.service_id
      WHERE u.deleted_at IS NULL ${filter}
        AND a.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND a.time ~ '^[0-9]{2}:[0-9]{2}$'`,
    params
  );
  const orders = await executor.query(
    `SELECT o.user_id, o.status, o.total_amount, o.created_at
       FROM orders o JOIN users u ON u.id = o.user_id
      WHERE u.deleted_at IS NULL ${filter}`,
    params
  );

  const activity = new Map(users.rows.map((u) => [u.id, { appointments: [], orders: [] }]));
  for (const a of appts.rows) {
    activity.get(a.user_id)?.appointments.push({
      status: a.status,
      kind: a.kind,
      priceIls: a.price_ils == null ? null : Number(a.price_ils),
      startsAt: a.starts_at,
    });
  }
  for (const o of orders.rows) {
    activity.get(o.user_id)?.orders.push({ status: o.status, totalAgorot: o.total_amount, createdAt: o.created_at });
  }

  for (const [userId, data] of activity) {
    const result = computeCustomerScore(data, now);
    await executor.query(
      `INSERT INTO customer_scores (user_id, score, tier, breakdown, last_activity_at, computed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       ON CONFLICT (user_id) DO UPDATE
         SET score = EXCLUDED.score, tier = EXCLUDED.tier, breakdown = EXCLUDED.breakdown,
             last_activity_at = EXCLUDED.last_activity_at, computed_at = EXCLUDED.computed_at`,
      [
        userId,
        result.score,
        result.tier,
        JSON.stringify({ parts: result.breakdown, insufficientData: result.insufficientData }),
        result.lastActivityAt,
      ]
    );
  }
  return activity.size;
}

const STALE_AFTER_MINUTES = 10;

/** Periodic refresh: recompute everything when any active user is missing a score or the oldest one is stale. */
export async function ensureScoresFresh(executor) {
  const { rows } = await executor.query(
    `SELECT count(*) FILTER (WHERE cs.user_id IS NULL)::int AS missing,
            min(cs.computed_at) < now() - interval '${STALE_AFTER_MINUTES} minutes' AS stale
       FROM users u LEFT JOIN customer_scores cs ON cs.user_id = u.id
      WHERE u.deleted_at IS NULL`
  );
  if (rows[0].missing > 0 || rows[0].stale) await refreshCustomerScores(executor);
}

/** Refresh the users an appointment belongs to (by account link or matching phone). Never throws. */
export async function refreshScoresForAppointment(executor, appointment) {
  try {
    const { rows } = await executor.query(
      `SELECT id FROM users WHERE deleted_at IS NULL AND (id = $1 OR (phone_e164 IS NOT NULL AND phone_e164 = $2))`,
      [appointment.user_id || null, appointment.phone_e164 || null]
    );
    if (rows.length) await refreshCustomerScores(executor, { userIds: rows.map((r) => r.id) });
  } catch (err) {
    console.error("[scores] refresh after booking failed:", err?.code || "", err?.message);
  }
}
