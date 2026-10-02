import { Router } from "express";
import db, { transaction } from "../db.js";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";
import {
  LIST_SORTS,
  SCORE_TIER_VALUES,
  computeCustomerStats,
  getCustomerSummary,
  listCustomers,
} from "../adminService.js";
import { loadMeasurement, loadOrders, loadShipments } from "../profileData.js";
import { ROLES, isStaffRole, recordAudit } from "../roles.js";
import { ensureScoresFresh } from "../customerScore.js";
import { countUnreadNotifications, listNotifications, markNotificationRead } from "../notifications.js";
import {
  APPOINTMENT_STATUSES,
  STAFF_SCOPES,
  changeAppointmentStatus,
  listAppointmentsForStaff,
} from "../appointmentsService.js";
import { sendStatusChangeError } from "./appointmentStatus.js";

const router = Router();

router.use(requireAdmin);

function reply(res, status, code, message) {
  return res.status(status).json({ success: false, code, error: message, errorMessage: message });
}

function badRequest(res, message) {
  return reply(res, 400, "VALIDATION_ERROR", message);
}

export function parseUserId(raw) {
  const value = String(raw ?? "");
  if (!/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

function parseListQuery(query) {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search.length > 100) return { error: "החיפוש ארוך מדי." };

  const role = typeof query.role === "string" ? query.role : "";
  if (role && !Object.values(ROLES).includes(role)) return { error: "סינון תפקיד לא חוקי." };

  const tier = typeof query.tier === "string" ? query.tier : "";
  if (tier && !SCORE_TIER_VALUES.includes(tier)) return { error: "סינון דירוג לא חוקי." };

  const sort = typeof query.sort === "string" && query.sort ? query.sort : "newest";
  if (!LIST_SORTS.includes(sort)) return { error: "מיון לא חוקי." };

  const status = typeof query.status === "string" && query.status ? query.status : "active";
  if (status !== "active" && status !== "removed") return { error: "סינון סטטוס לא חוקי." };

  const page = query.page == null || query.page === "" ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return { error: "מספר עמוד לא חוקי." };

  const pageSize = query.pageSize == null || query.pageSize === "" ? 20 : Number(query.pageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return { error: "גודל עמוד לא חוקי." };

  return { value: { search, role, tier, sort, removed: status === "removed", page, pageSize } };
}

/** Who may remove whom: owner -> admin/customer, admin -> customer. Nobody removes the owner or themselves. */
export function canRemoveUser(actor, target) {
  if (!target || target.removedAt || target.id === actor.id || target.role === ROLES.OWNER) return false;
  if (actor.role === ROLES.OWNER) return true;
  return actor.role === ROLES.ADMIN && target.role === ROLES.CUSTOMER;
}

router.get(
  "/customers",
  asyncRoute(async (req, res) => {
    const parsed = parseListQuery(req.query);
    if (parsed.error) return badRequest(res, parsed.error);
    if (parsed.value.removed && req.user.role !== ROLES.OWNER) {
      return reply(res, 403, "FORBIDDEN", "רשימת המשתמשים שהוסרו זמינה לבעלים של האתר בלבד.");
    }
    await ensureScoresFresh(db);
    return res.json({ success: true, ...(await listCustomers(parsed.value)) });
  })
);

router.get(
  "/customers/:id",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return badRequest(res, "מזהה לקוח לא חוקי.");

    const isOwner = req.user.role === ROLES.OWNER;
    const customer = await getCustomerSummary(id);
    // Removed accounts are only visible to the owner.
    if (!customer || (customer.removedAt && !isOwner)) {
      return reply(res, 404, "NOT_FOUND", "הלקוח לא נמצא.");
    }

    const [measurement, orders, shipments] = await Promise.all([
      loadMeasurement(id),
      loadOrders(id),
      loadShipments(id),
    ]);

    const canManageRole =
      isOwner && customer.role !== ROLES.OWNER && customer.id !== req.user.id && !customer.removedAt;

    return res.json({
      success: true,
      customer,
      measurement,
      orders,
      shipments,
      permissions: {
        canManageRole,
        canRemove: canRemoveUser(req.user, customer),
        canRestore: isOwner && Boolean(customer.removedAt),
      },
    });
  })
);

router.delete(
  "/customers/:id",
  asyncRoute(async (req, res) => {
    const targetId = parseUserId(req.params.id);
    if (!targetId) return badRequest(res, "מזהה לקוח לא חוקי.");
    if (targetId === req.user.id) return reply(res, 403, "FORBIDDEN", "אי אפשר להסיר את החשבון שלך מכאן.");

    let outcome;
    try {
      outcome = await transaction(async (tx) => {
        const actorRow = await tx.query(`SELECT id, role, deleted_at FROM users WHERE id = $1 FOR SHARE`, [
          req.user.id,
        ]);
        const actor = actorRow.rows[0];
        if (!actor || actor.deleted_at || !isStaffRole(actor.role)) {
          return { status: 403, message: "אין לך הרשאה לאזור הניהול." };
        }

        const targetRow = await tx.query(`SELECT id, role, deleted_at FROM users WHERE id = $1 FOR UPDATE`, [targetId]);
        const target = targetRow.rows[0];
        if (!target || (target.deleted_at && actor.role !== ROLES.OWNER)) {
          return { status: 404, message: "הלקוח לא נמצא." };
        }
        if (target.deleted_at) return { status: 409, message: "המשתמש כבר הוסר." };
        if (target.role === ROLES.OWNER) return { status: 403, message: "אי אפשר להסיר את בעלי האתר." };
        if (!canRemoveUser({ id: actor.id, role: actor.role }, { id: target.id, role: target.role })) {
          return { status: 403, message: "מנהל יכול להסיר רק לקוחות רגילים." };
        }

        await tx.query(`UPDATE users SET deleted_at = now(), deleted_by = $2, updated_at = now() WHERE id = $1`, [
          targetId,
          actor.id,
        ]);
        await tx.query(`DELETE FROM user_sessions WHERE user_id = $1`, [targetId]);
        await recordAudit(tx, {
          actorUserId: actor.id,
          action: "user_removed",
          targetUserId: targetId,
          details: { role: target.role, mode: "soft" },
        });
        return { status: 200 };
      });
    } catch (err) {
      if (err?.code === "P0001") return reply(res, 403, "FORBIDDEN", "אי אפשר להסיר את בעלי האתר.");
      throw err;
    }

    if (outcome.status !== 200) {
      const code = { 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "ALREADY_REMOVED" }[outcome.status];
      return reply(res, outcome.status, code, outcome.message);
    }
    return res.json({ success: true, customer: await getCustomerSummary(targetId) });
  })
);

router.get(
  "/customer-stats",
  asyncRoute(async (_req, res) => {
    return res.json({ success: true, stats: await computeCustomerStats() });
  })
);

router.get(
  "/notifications",
  asyncRoute(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && status !== "new" && status !== "read") return badRequest(res, "סינון התראות לא חוקי.");
    const [notifications, unread] = await Promise.all([listNotifications({ status }), countUnreadNotifications()]);
    return res.json({ success: true, notifications, unread });
  })
);

router.get(
  "/notifications/unread-count",
  asyncRoute(async (_req, res) => {
    return res.json({ success: true, unread: await countUnreadNotifications() });
  })
);

router.get(
  "/appointments",
  asyncRoute(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !APPOINTMENT_STATUSES.includes(status)) return badRequest(res, "סינון סטטוס לא חוקי.");
    const scope = typeof req.query.scope === "string" && req.query.scope ? req.query.scope : "upcoming";
    if (!STAFF_SCOPES.includes(scope)) return badRequest(res, "סינון תאריכים לא חוקי.");
    return res.json({ success: true, ...(await listAppointmentsForStaff({ status, scope })) });
  })
);

async function applyStatus(req, res, nextStatus) {
  const id = parseUserId(req.params.id);
  if (!id) return badRequest(res, "מזהה תור לא חוקי.");
  try {
    const appointment = await changeAppointmentStatus(id, nextStatus, req.user.id);
    return res.json({ success: true, appointment });
  } catch (err) {
    if (sendStatusChangeError(res, err)) return undefined;
    throw err;
  }
}

router.post("/appointments/:id/confirm", asyncRoute((req, res) => applyStatus(req, res, "confirmed")));
router.post("/appointments/:id/reject", asyncRoute((req, res) => applyStatus(req, res, "rejected")));
router.post("/appointments/:id/cancel", asyncRoute((req, res) => applyStatus(req, res, "cancelled")));
router.patch(
  "/appointments/:id/status",
  asyncRoute((req, res) => applyStatus(req, res, typeof req.body?.status === "string" ? req.body.status : ""))
);

router.patch(
  "/notifications/:id/read",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return badRequest(res, "מזהה התראה לא חוקי.");
    const notification = await markNotificationRead(id, req.user.id);
    if (!notification) return reply(res, 404, "NOT_FOUND", "ההתראה לא נמצאה.");
    return res.json({ success: true, notification, unread: await countUnreadNotifications() });
  })
);

export default router;
