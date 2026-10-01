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
  {
    id: "003_roles_and_audit",
    sql: `
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer';
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'customer'));
      ALTER TABLE users ADD COLUMN role_updated_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN role_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

      -- At most one owner, enforced by the database itself.
      CREATE UNIQUE INDEX users_single_owner ON users (role) WHERE role = 'owner';
      CREATE INDEX idx_users_created_at ON users (created_at);

      -- The owner row can never be demoted or deleted through normal queries,
      -- so the site can never end up without an owner.
      CREATE OR REPLACE FUNCTION protect_owner_row() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
          RAISE EXCEPTION 'the site owner cannot be deleted' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
          RAISE EXCEPTION 'the site owner role cannot be changed' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER users_protect_owner
        BEFORE UPDATE OF role OR DELETE ON users
        FOR EACH ROW EXECUTE FUNCTION protect_owner_row();

      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_audit_log_target ON audit_log (target_user_id, created_at DESC);
      CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);
    `,
  },
  {
    id: "004_phone_notifications_removal_scores_content",
    sql: `
      -- Phone: nullable so existing accounts keep working; new sign-ups must provide one.
      -- The partial unique index is the source of truth for "one account per phone" (also under races).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_display TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD CONSTRAINT users_phone_e164_format
        CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\\+[1-9][0-9]{6,14}$');
      CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_key ON users (phone_e164) WHERE phone_e164 IS NOT NULL;

      -- Soft delete: removed accounts keep their row, orders and phone reservation.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

      CREATE OR REPLACE FUNCTION protect_owner_row() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
          RAISE EXCEPTION 'the site owner cannot be deleted' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role IS DISTINCT FROM 'owner' THEN
          RAISE EXCEPTION 'the site owner role cannot be changed' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.deleted_at IS NOT NULL THEN
          RAISE EXCEPTION 'the site owner cannot be removed' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS users_protect_owner ON users;
      CREATE TRIGGER users_protect_owner
        BEFORE UPDATE OF role, deleted_at OR DELETE ON users
        FOR EACH ROW EXECUTE FUNCTION protect_owner_row();

      -- Structured booking data for the customer score (no text matching on notes).
      ALTER TABLE services ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'other';
      UPDATE services SET kind = CASE name_he
          WHEN 'בניה בתבנית (בניוגל)' THEN 'build'
          WHEN 'בניה בטיפס' THEN 'build'
          WHEN 'מילוי בניה' THEN 'fill'
          WHEN 'הסרת בניה מקצועית' THEN 'removal'
          WHEN 'מניקור ג''ל' THEN 'manicure'
          WHEN 'לק ג''ל בלבד' THEN 'manicure'
          WHEN 'פדיקור ספא' THEN 'pedicure'
          WHEN 'עיצובי אקססוריז וציפורני יוקרה' THEN 'design'
          ELSE kind
        END
        WHERE kind = 'other';

      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_key TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_label TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_kind TEXT;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_ils INTEGER;
      CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments (user_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_phone_e164 ON appointments (phone_e164);

      -- Internal notifications shown to the owner and every admin.
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
        related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        dedupe_key TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ,
        read_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_status ON admin_notifications (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_dedupe ON admin_notifications (dedupe_key, created_at DESC);

      -- Cached internal customer score (staff only), refreshed on booking changes and periodically.
      CREATE TABLE IF NOT EXISTS customer_scores (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
        tier TEXT NOT NULL CHECK (tier IN ('top', 'high', 'medium', 'low')),
        breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_activity_at TIMESTAMPTZ,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_scores_score ON customer_scores (score DESC);

      -- Staff-managed content pages rendered with the site's own components (no raw HTML).
      CREATE TABLE IF NOT EXISTS content_pages (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        eyebrow TEXT NOT NULL DEFAULT '',
        seo_title TEXT NOT NULL DEFAULT '',
        seo_description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS content_pages_slug_key ON content_pages (slug) WHERE deleted_at IS NULL;

      CREATE TABLE IF NOT EXISTS content_page_sections (
        id SERIAL PRIMARY KEY,
        page_id INTEGER NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('heading', 'paragraph', 'list', 'image', 'cta', 'links')),
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (page_id, position)
      );
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
