import { Router } from "express";
import rateLimit from "express-rate-limit";
import { transaction } from "../db.js";
import { requireOwner } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";
import { getCustomerSummary } from "../adminService.js";
import { ASSIGNABLE_ROLES, ROLES, recordAudit } from "../roles.js";
import { parseUserId } from "./admin.js";

const router = Router();

function reply(res, status, code, message) {
  return res.status(status).json({ success: false, code, error: message, errorMessage: message });
}

const roleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `owner-role:${req.user.id}`,
  message: { success: false, code: "RATE_LIMITED", error: "יותר מדי שינויי הרשאות. אפשר לנסות שוב בעוד כמה דקות." },
});

router.patch(
  "/users/:id/role",
  requireOwner,
  roleLimiter,
  asyncRoute(async (req, res) => {
    const targetId = parseUserId(req.params.id);
    if (!targetId) return reply(res, 400, "VALIDATION_ERROR", "מזהה משתמש לא חוקי.");

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(res, 400, "VALIDATION_ERROR", "בקשה לא תקינה.");
    }
    if (Object.keys(body).some((key) => key !== "role")) {
      return reply(res, 400, "VALIDATION_ERROR", "אפשר לעדכן כאן רק את התפקיד.");
    }
    if (!ASSIGNABLE_ROLES.includes(body.role)) {
      return reply(res, 400, "VALIDATION_ERROR", "תפקיד לא חוקי.");
    }
    if (targetId === req.user.id) {
      return reply(res, 403, "FORBIDDEN", "אי אפשר לשנות את התפקיד של החשבון שלך.");
    }

    const nextRole = body.role;
    let outcome;
    try {
      outcome = await transaction(async (tx) => {
        const actor = await tx.query(`SELECT role FROM users WHERE id = $1 FOR SHARE`, [req.user.id]);
        if (actor.rows[0]?.role !== ROLES.OWNER) return { status: 403, message: "הפעולה הזו שמורה לבעלים של האתר בלבד." };

        const target = await tx.query(`SELECT id, role FROM users WHERE id = $1 FOR UPDATE`, [targetId]);
        const current = target.rows[0];
        if (!current) return { status: 404, message: "המשתמש לא נמצא." };
        if (current.role === ROLES.OWNER) return { status: 403, message: "אי אפשר לשנות את התפקיד של בעלי האתר." };
        if (current.role === nextRole) return { status: 200, changed: false };

        await tx.query(
          `UPDATE users SET role = $1, role_updated_at = now(), role_updated_by = $2, updated_at = now() WHERE id = $3`,
          [nextRole, req.user.id, targetId]
        );
        await recordAudit(tx, {
          actorUserId: req.user.id,
          action: nextRole === ROLES.ADMIN ? "admin_granted" : "admin_revoked",
          targetUserId: targetId,
          details: { from: current.role, to: nextRole },
        });
        return { status: 200, changed: true };
      });
    } catch (err) {
      if (err?.code === "P0001") return reply(res, 403, "FORBIDDEN", "אי אפשר לשנות את התפקיד של בעלי האתר.");
      throw err;
    }

    if (outcome.status !== 200) {
      return reply(res, outcome.status, outcome.status === 404 ? "NOT_FOUND" : "FORBIDDEN", outcome.message);
    }

    return res.json({ success: true, changed: outcome.changed, customer: await getCustomerSummary(targetId) });
  })
);

export default router;
