import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  changeAppointmentStatus,
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
    const { clientName, phone, serviceId, date, time } = body;
    if (!clientName || !phone || !serviceId || !date || !time) {
      return reply(res, 400, "VALIDATION_ERROR", "חסרים פרטים לבקשת התור.");
    }
    try {
      const { appointment, duplicate } = await createAppointmentRequest(
        {
          clientName,
          phone,
          email: body.email,
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
      if (err.message === "INVALID") return reply(res, 400, "VALIDATION_ERROR", err.userMessage);
      throw err;
    }
  })
);

/** Status changes are staff-only; customers can't confirm, reject or cancel through the API. */
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
