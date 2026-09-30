import db from "./db.js";

export const STATS_TIMEZONE = "Asia/Jerusalem";

const SUMMARY_SELECT = `
  SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.role,
         u.created_at, u.last_login_at, u.role_updated_at,
         GREATEST(u.last_login_at, sess.last_used_at) AS last_active_at,
         EXISTS (
           SELECT 1 FROM measurement_profiles mp WHERE mp.user_id = u.id AND mp.is_active = 1
         ) AS has_measurements,
         (SELECT count(*)::int FROM orders o WHERE o.user_id = u.id) AS orders_count,
         (
           SELECT mp.phone FROM measurement_profiles mp
           WHERE mp.user_id = u.id AND mp.phone !~ '^user-'
           ORDER BY mp.updated_at DESC, mp.id DESC LIMIT 1
         ) AS phone
  FROM users u
  LEFT JOIN LATERAL (
    SELECT max(s.last_used_at) AS last_used_at FROM user_sessions s WHERE s.user_id = u.id
  ) sess ON true`;

/** Fields an admin may see. Password hashes, session tokens and internal ids of other tables are never included. */
function mapCustomer(row) {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    phone: row.phone || null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    lastActiveAt: row.last_active_at || null,
    roleUpdatedAt: row.role_updated_at || null,
    hasMeasurements: Boolean(row.has_measurements),
    ordersCount: Number(row.orders_count) || 0,
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listCustomers({ search = "", role = "", sort = "newest", page = 1, pageSize = 20 }) {
  const params = [];
  const conditions = [];

  if (search) {
    params.push(`%${escapeLike(search)}%`);
    const like = `$${params.length}`;
    const clauses = [
      `u.first_name ILIKE ${like}`,
      `u.last_name ILIKE ${like}`,
      `u.username ILIKE ${like}`,
      `(u.first_name || ' ' || u.last_name) ILIKE ${like}`,
    ];
    const digits = search.replace(/\D/g, "");
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      clauses.push(
        `EXISTS (SELECT 1 FROM measurement_profiles mp WHERE mp.user_id = u.id AND mp.phone LIKE $${params.length})`
      );
    }
    conditions.push(`(${clauses.join(" OR ")})`);
  }

  if (role) {
    params.push(role);
    conditions.push(`u.role = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const direction = sort === "oldest" ? "ASC" : "DESC";

  const countResult = await db.query(`SELECT count(*)::int AS total FROM users u ${where}`, params);
  const total = countResult.rows[0].total;

  const pageParams = [...params, pageSize, (page - 1) * pageSize];
  const { rows } = await db.query(
    `${SUMMARY_SELECT} ${where}
     ORDER BY u.created_at ${direction}, u.id ${direction}
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );

  const roleCounts = await db.query(`SELECT role, count(*)::int AS n FROM users GROUP BY role`);
  const totals = { all: 0, owner: 0, admin: 0, customer: 0 };
  for (const r of roleCounts.rows) {
    totals[r.role] = r.n;
    totals.all += r.n;
  }

  return {
    customers: rows.map(mapCustomer),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    totals,
  };
}

export async function getCustomerSummary(userId, executor = db) {
  const { rows } = await executor.query(`${SUMMARY_SELECT} WHERE u.id = $1`, [userId]);
  return rows[0] ? mapCustomer(rows[0]) : null;
}

function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Sign-up statistics computed in PostgreSQL in Asia/Jerusalem time.
 * - today: since 00:00 local time
 * - last 7 days: rolling 7 x 24h window ending now
 * - current week: since Sunday 00:00 local time until now
 * - previous week: the full Sunday-to-Saturday week before it
 */
export async function computeCustomerStats(nowOverride = null, executor = db) {
  const { rows } = await executor.query(
    `WITH base AS (
       SELECT n AS now_ts, (n AT TIME ZONE $2) AS local_now
       FROM (SELECT COALESCE($1::timestamptz, now()) AS n) x
     ), local_bounds AS (
       SELECT now_ts,
              date_trunc('day', local_now) AS today_local,
              date_trunc('day', local_now) - make_interval(days => EXTRACT(DOW FROM local_now)::int) AS week_local
       FROM base
     ), bounds AS (
       SELECT now_ts,
              today_local AT TIME ZONE $2 AS today_start,
              week_local AT TIME ZONE $2 AS week_start,
              (week_local - interval '7 days') AT TIME ZONE $2 AS prev_week_start,
              week_local
       FROM local_bounds
     )
     SELECT b.now_ts, b.week_start,
            (SELECT count(*)::int FROM users WHERE created_at <= b.now_ts) AS total,
            (SELECT count(*)::int FROM users WHERE created_at >= b.today_start AND created_at <= b.now_ts) AS today,
            (SELECT count(*)::int FROM users WHERE created_at > b.now_ts - interval '7 days' AND created_at <= b.now_ts) AS last7,
            (SELECT count(*)::int FROM users WHERE created_at >= b.week_start AND created_at <= b.now_ts) AS this_week,
            (SELECT count(*)::int FROM users WHERE created_at >= b.prev_week_start AND created_at < b.week_start) AS prev_week,
            to_char(b.week_local, 'YYYY-MM-DD') AS week_start_date,
            to_char(b.week_local - interval '7 days', 'YYYY-MM-DD') AS prev_week_start_date,
            to_char(b.week_local - interval '1 day', 'YYYY-MM-DD') AS prev_week_end_date
     FROM bounds b`,
    [nowOverride, STATS_TIMEZONE]
  );
  const s = rows[0];

  const busiest = await executor.query(
    `SELECT to_char((created_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
     FROM users
     WHERE created_at >= $2 AND created_at <= $3
     GROUP BY 1
     ORDER BY n DESC, day DESC
     LIMIT 1`,
    [STATS_TIMEZONE, s.week_start, s.now_ts]
  );

  const recent = await executor.query(
    `SELECT id, username, first_name, last_name, role, created_at
     FROM users WHERE created_at <= $1
     ORDER BY created_at DESC, id DESC LIMIT 5`,
    [s.now_ts]
  );

  return {
    timezone: STATS_TIMEZONE,
    generatedAt: s.now_ts,
    totals: { all: s.total, today: s.today, last7Days: s.last7 },
    week: {
      current: { startDate: s.week_start_date, count: s.this_week },
      previous: { startDate: s.prev_week_start_date, endDate: s.prev_week_end_date, count: s.prev_week },
      change: s.this_week - s.prev_week,
      changePercent: percentChange(s.this_week, s.prev_week),
      busiestDay: busiest.rows[0] ? { date: busiest.rows[0].day, count: busiest.rows[0].n } : null,
    },
    recentSignups: recent.rows.map((r) => ({
      id: r.id,
      username: r.username,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      createdAt: r.created_at,
    })),
  };
}
