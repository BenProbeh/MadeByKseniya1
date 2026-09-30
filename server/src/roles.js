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

/**
 * Assign the owner role to users.id = OWNER_USER_ID when the site has no owner yet.
 * Never creates a second owner and never moves ownership away from an existing owner.
 */
export async function ensureOwner(backend, ownerUserId) {
  if (!ownerUserId) {
    const { rows } = await backend.query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
    if (!rows.length) console.warn("[owner] no site owner yet - set OWNER_USER_ID to the owner's users.id");
    return { status: rows.length ? "exists" : "unset" };
  }

  return backend.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [4815162343]);
    const existing = await tx.query(`SELECT id FROM users WHERE role = 'owner'`);
    if (existing.rows.length) {
      const currentId = existing.rows[0].id;
      if (currentId !== ownerUserId) {
        console.warn(`[owner] OWNER_USER_ID=${ownerUserId} ignored: user ${currentId} is already the owner`);
      }
      return { status: "exists", ownerId: currentId };
    }

    const target = await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [ownerUserId]);
    if (!target.rows.length) {
      console.warn(`[owner] OWNER_USER_ID=${ownerUserId} does not match any user`);
      return { status: "missing" };
    }

    await tx.query(
      `UPDATE users SET role = 'owner', role_updated_at = now(), role_updated_by = NULL, updated_at = now() WHERE id = $1`,
      [ownerUserId]
    );
    await recordAudit(tx, {
      action: "owner_assigned",
      targetUserId: ownerUserId,
      details: { source: "OWNER_USER_ID" },
    });
    console.log(`[owner] user ${ownerUserId} assigned as site owner`);
    return { status: "assigned", ownerId: ownerUserId };
  });
}
