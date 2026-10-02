import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  changeAppointmentStatus,
  confirmAppointmentByToken,
  confirmAppointmentForUser,
  createAppointmentRequest,
  getAvailability,
  isValidDateStr,
  listAppointmentsForUser,
  MAX_PENDING_PER_USER,
} from "../appointmentsService.js";
import { asyncRoute } from "../http.js";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware.js";
import { sendStatusChangeError } from "./appointmentStatus.js";

const router = Router();

const MESSAGES = Object.freeze({
  slotTaken: "השעה הזו נתפסה בינתיים. אפשר לבחור שעה אחרת.",
  tooManyPending: `יש לך כבר ${MAX_PENDING_PER_USER} בקשות שממתינות לאישור. אעבור עליהן בהקדם, ואז אפשר יהיה לשלוח בקשה נוספת.`,
  emailNotVerified: "כדי לשלוח בקשה לתור צריך קודם לאמת את כתובת האימייל בחשבון.",
  confirmInvalid: "הקישור לא תקין או שכבר לא בתוקף. אפשר לפתוח את התורים שלי באתר או לכתוב לי ואסדר את זה.",
  confirmUnavailable: "התור הזה כבר לא פעיל, ולכן אי אפשר לאשר אותו. אם זו טעות, כתבי לי ואבדוק.",
  confirmExpired: "פג התוקף של הקישור לאישור ההזמנה. כתבי לי ואשלח קישור חדש.",
});

const CONFIRM_FAILURES = Object.freeze({
  invalid: [400, "CONFIRM_INVALID", MESSAGES.confirmInvalid],
  unavailable: [409, "CONFIRM_UNAVAILABLE", MESSAGES.confirmUnavailable],
  expired: [410, "CONFIRM_EXPIRED", MESSAGES.confirmExpired],
});

function sendConfirmResult(res, result) {
  if (result.ok) {
    return res.json({ success: true, alreadyConfirmed: result.alreadyConfirmed, appointment: result.appointment });
  }
  const [status, code, message] = CONFIRM_FAILURES[result.reason] || CONFIRM_FAILURES.invalid;
  return reply(res, status, code, message);
}

const confirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMITED", error: "יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות." },
});

function reply(res, status, code, message) {
  return res.status(status).json({ success: false, code, error: message, errorMessage: message });
}

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `booking:${req.user.id}`,
  message: { success: false, code: "RATE_LIMITED", error: "יותר מדי בקשות ברצף. אפשר לנסות שוב בעוד כמה דקות." },
});

/** Public: per start time only "free", "pending" or "booked" — never who booked or what. */
router.get(
  "/availability",
  asyncRoute(async (req, res) => {
    const { date, serviceId } = req.query;
    if (!date || !serviceId) {
      return res.status(400).json({ error: "date and serviceId are required" });
    }
    if (!isValidDateStr(date)) return res.status(400).json({ error: "invalid date" });
    res.set("Cache-Control", "no-store");
    res.json(await getAvailability(date, Number(serviceId)));
  })
);

/** The signed-in customer's own requests and bookings. */
router.get(
  "/mine",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, appointments: await listAppointmentsForUser(req.user.id) });
  })
);

/** A booking request: always created as 'pending' until the owner or an admin decides. */
router.post(
  "/",
  requireAuth,
  bookingLimiter,
  asyncRoute(async (req, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { clientName, serviceId, date, time } = body;
    if (!clientName || !serviceId || !date || !time) {
      return reply(res, 400, "VALIDATION_ERROR", "חסרים פרטים לבקשת התור.");
    }
    if (!req.user.emailVerified) return reply(res, 403, "EMAIL_NOT_VERIFIED", MESSAGES.emailNotVerified);
    try {
      const { appointment, duplicate } = await createAppointmentRequest(
        {
          clientName,
          phone: body.phone,
          serviceId,
          date,
          time,
          notes: body.notes,
          packageKey: typeof body.packageKey === "string" ? body.packageKey : null,
          requestKey: body.requestKey,
        },
        { userId: req.user.id }
      );
      return res.status(duplicate ? 200 : 201).json({ success: true, appointment, duplicate });
    } catch (err) {
      if (err.message === "SLOT_TAKEN") return reply(res, 409, "SLOT_TAKEN", MESSAGES.slotTaken);
      if (err.message === "TOO_MANY_PENDING") return reply(res, 409, "TOO_MANY_PENDING", MESSAGES.tooManyPending);
      if (err.message === "EMAIL_NOT_VERIFIED") return reply(res, 403, "EMAIL_NOT_VERIFIED", MESSAGES.emailNotVerified);
      if (err.message === "INVALID") return reply(res, 400, "VALIDATION_ERROR", err.userMessage);
      throw err;
    }
  })
);

/** The "אישור ההזמנה" link from the approval email (works without signing in; the token is the proof). */
router.post(
  "/confirm-booking",
  confirmLimiter,
  asyncRoute(async (req, res) => {
    const id = Number(req.body?.id);
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    return sendConfirmResult(res, await confirmAppointmentByToken(id, token));
  })
);

/** The same final confirmation from the customer's profile, for her own booking only. */
router.post(
  "/:id/confirm",
  requireAuth,
  confirmLimiter,
  asyncRoute(async (req, res) => {
    return sendConfirmResult(res, await confirmAppointmentForUser(req.params.id, req.user.id));
  })
);

/** Staff-only status changes; a customer's only step is the final confirmation above. */
router.patch(
  "/:id",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.date !== undefined || body.time !== undefined) {
      return reply(res, 400, "VALIDATION_ERROR", "אפשר לשנות כאן רק את סטטוס התור.");
    }
    try {
      const appointment = await changeAppointmentStatus(req.params.id, body.status, req.user.id);
      return res.json({ success: true, appointment });
    } catch (err) {
      if (sendStatusChangeError(res, err)) return undefined;
      throw err;
    }
  })
);

export default router;
