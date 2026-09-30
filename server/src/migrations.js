/**
 * Ordered, append-only schema migrations. Never edit a migration that has shipped;
 * add a new entry instead. Applied ids are recorded in schema_migrations.
 */
export const migrations = [
  {
    id: "001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name_he TEXT NOT NULL,
        description_he TEXT NOT NULL,
        price_ils INTEGER NOT NULL,
        duration_min INTEGER NOT NULL,
        category TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        client_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        service_id INTEGER NOT NULL REFERENCES services(id),
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
      CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone);

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ,
        CONSTRAINT users_username_key UNIQUE (username),
        CONSTRAINT users_username_lowercase CHECK (username = lower(username))
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        remember_me SMALLINT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS user_avatars (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mime TEXT NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_user_avatars_user ON user_avatars(user_id);

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL UNIQUE,
        total_amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ILS',
        status TEXT NOT NULL,
        title_he TEXT,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

      CREATE TABLE IF NOT EXISTS shipments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        carrier TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        status TEXT NOT NULL,
        shipped_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);

      CREATE TABLE IF NOT EXISTS measurement_profiles (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        coin_id TEXT,
        consent_store_images SMALLINT NOT NULL DEFAULT 0,
        is_active SMALLINT NOT NULL DEFAULT 1,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_measurement_profiles_phone ON measurement_profiles(phone);
      CREATE INDEX IF NOT EXISTS idx_measurement_profiles_user ON measurement_profiles(user_id);

      CREATE TABLE IF NOT EXISTS finger_measurements (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES measurement_profiles(id) ON DELETE CASCADE,
        hand_id TEXT NOT NULL,
        finger_id TEXT NOT NULL,
        width_mm DOUBLE PRECISION,
        size INTEGER,
        confidence DOUBLE PRECISION,
        coin_id TEXT,
        manual_override SMALLINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed',
        capture_quality_json TEXT,
        photo_quality_score INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_finger_measurements_profile ON finger_measurements(profile_id);

      CREATE TABLE IF NOT EXISTS measurement_links (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        profile_id INTEGER NOT NULL REFERENCES measurement_profiles(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "002_seed_services",
    sql: `
      INSERT INTO services (name_he, description_he, price_ils, duration_min, category)
      SELECT v.name_he, v.description_he, v.price_ils, v.duration_min, v.category
      FROM (VALUES
        ('מניקור ג''ל', 'ציפוי ג''ל עמיד לציפורניים טבעיות, כולל טיפוח קוטיקולה וגימור מבריק.', 120, 60, 'מניקור'),
        ('בניה בתבנית (בניוגל)', 'הארכת ציפורניים בתבנית עם ג''ל בניה, אורך וצורה לבחירה.', 180, 90, 'בניה'),
        ('בניה בטיפס', 'הארכת ציפורניים בטיפס קפסולה עם ציפוי ג''ל, תוצאה טבעית וחזקה.', 190, 90, 'בניה'),
        ('מילוי בניה', 'מילוי חודשי לציפורניים בנויות, כולל תיקון וחיזוק.', 150, 75, 'בניה'),
        ('פדיקור ספא', 'טיפול פדיקור מלא עם פילינג, עיסוי ולק ג''ל.', 160, 60, 'פדיקור'),
        ('עיצובי אקססוריז וציפורני יוקרה', 'עיצוב אמנותי, חרסינה, אבנים ופרטים מיוחדים לפי בקשה.', 60, 30, 'עיצוב'),
        ('לק ג''ל בלבד', 'החלפת לק ג''ל על ציפורניים טבעיות או בנויות קיימות.', 90, 45, 'מניקור'),
        ('הסרת בניה מקצועית', 'פירוק והסרה עדינה של בניה קיימת ללא פגיעה בציפורן הטבעית.', 50, 30, 'טיפוח')
      ) AS v(name_he, description_he, price_ils, duration_min, category)
      WHERE NOT EXISTS (SELECT 1 FROM services);
    `,
  },
];

const LOCK_KEY = 4815162342;

export async function runMigrations(backend) {
  await backend.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = [];
  for (const migration of migrations) {
    const ran = await backend.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      const { rows } = await tx.query("SELECT 1 FROM schema_migrations WHERE id = $1", [migration.id]);
      if (rows.length) return false;
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
      return true;
    });
    if (ran) applied.push(migration.id);
  }
  return applied;
}
