export const ROLES = Object.freeze({ OWNER: "owner", ADMIN: "admin", CUSTOMER: "customer" });

export const ASSIGNABLE_ROLES = Object.freeze([ROLES.ADMIN, ROLES.CUSTOMER]);

export function isStaffRole(role) {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

/** Append-only log of sensitive account actions. Never pass passwords, hashes or tokens in details. */
export async function recordAudit(executor, { actorUserId = null, action, targetUserId = null, details = {} }) {
  await executor.query(
    `INSERT INTO audit_log (actor_user_id, action, target_user_id, details) VALUES ($1, $2, $3, $4::jsonb)`,
    [actorUserId, action, targetUserId, JSON.stringify(details)]
  );
}

export async function hasOwner(executor) {
  const { rows } = await executor.query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
  return rows.length > 0;
}

/** Stored usernames are lowercase without spaces; also drop ".", "_" and "-" so "ben.example" and "benexample" compare equal. */
function identityKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const IDENTITY_KEY_SQL = (column) => `regexp_replace(lower(${column}), '[^a-z0-9]', '', 'g')`;

async function promoteToOwner(tx, userId, details) {
  await tx.query(`UPDATE users SET role = 'owner', role_updated_at = now(), role_updated_by = NULL WHERE id = $1`, [
    userId,
  ]);
  await recordAudit(tx, { action: "owner_assigned", targetUserId: userId, details });
  console.log(`[owner] user ${userId} assigned as site owner (${details.source})`);
  return { status: "assigned", ownerId: userId, previousRole: details.previousRole };
}

/** Only accounts that already existed when the bootstrap shipped, so a later sign-up can never claim ownership. */
export const OWNER_BOOTSTRAP_CREATED_BEFORE = "2026-09-30T15:30:00Z";

/**
 * Existing account whose username (or full name) matches the bootstrap username.
 * Assigns only when exactly one account matches and it has a profile picture; otherwise changes nothing.
 */
async function assignOwnerByUsername(tx, key, createdBefore) {
  const { rows } = await tx.query(
    `SELECT id, role, avatar_url IS NOT NULL AS has_avatar
       FROM users
      WHERE (${IDENTITY_KEY_SQL("username")} = $1 OR ${IDENTITY_KEY_SQL("first_name || last_name")} = $1)
        AND created_at < $2
      ORDER BY id
      FOR UPDATE`,
    [key, createdBefore]
  );
  const ids = rows.map((r) => r.id);
  if (rows.length === 0) {
    console.warn("[owner] no site owner yet - no existing account matches the owner username");
    return { status: "not_found", candidates: [] };
  }
  if (rows.length > 1) {
    console.warn(`[owner] not assigned: ${rows.length} accounts could be the owner (ids ${ids.join(", ")})`);
    return { status: "ambiguous", candidates: ids };
  }
  const [target] = rows;
  if (!target.has_avatar) {
    console.warn(`[owner] not assigned: account ${target.id} matches but has no profile picture`);
    return { status: "unverified", candidates: ids };
  }
  return promoteToOwner(tx, target.id, { source: "username_bootstrap", previousRole: target.role, candidates: 1 });
}

/**
 * Assign the site owner when none exists yet: users.id = OWNER_USER_ID when set, otherwise the single
 * existing account matching the bootstrap username. Never creates users, never creates a second owner
 * and never moves ownership away from an existing owner. Afterwards the owner is known by users.role.
 */
export async function ensureOwner(
  backend,
  ownerUserId,
  { bootstrapUsername = "", createdBefore = OWNER_BOOTSTRAP_CREATED_BEFORE } = {}
) {
  const key = identityKey(bootstrapUsername);
  if (!ownerUserId && !key) {
    const exists = await hasOwner(backend);
    if (!exists) console.warn("[owner] no site owner yet - set OWNER_USER_ID to the owner's users.id");
    return { status: exists ? "exists" : "unset" };
  }

  return backend.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [4815162343]);
    const existing = await tx.query(`SELECT id FROM users WHERE role = 'owner'`);
    if (existing.rows.length) {
      const currentId = existing.rows[0].id;
      if (ownerUserId && currentId !== ownerUserId) {
        console.warn(`[owner] OWNER_USER_ID=${ownerUserId} ignored: user ${currentId} is already the owner`);
      }
      return { status: "exists", ownerId: currentId };
    }

    if (!ownerUserId) return assignOwnerByUsername(tx, key, createdBefore);

    const target = await tx.query(`SELECT id, role FROM users WHERE id = $1 FOR UPDATE`, [ownerUserId]);
    if (!target.rows.length) {
      console.warn(`[owner] OWNER_USER_ID=${ownerUserId} does not match any user`);
      return { status: "missing" };
    }
    return promoteToOwner(tx, ownerUserId, { source: "OWNER_USER_ID", previousRole: target.rows[0].role });
  });
}
