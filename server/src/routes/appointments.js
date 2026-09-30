import { Router } from "express";
import {
  getAvailability,
  createAppointment,
  findAppointmentsByPhone,
  updateAppointment,
} from "../appointmentsService.js";
import { asyncRoute } from "../http.js";

const router = Router();

router.get(
  "/availability",
  asyncRoute(async (req, res) => {
    const { date, serviceId } = req.query;
    if (!date || !serviceId) {
      return res.status(400).json({ error: "date and serviceId are required" });
    }
    res.json(await getAvailability(date, Number(serviceId)));
  })
);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: "phone is required" });
    res.json(await findAppointmentsByPhone(phone));
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { clientName, phone, email, serviceId, date, time, notes } = req.body;
    if (!clientName || !phone || !serviceId || !date || !time) {
      return res.status(400).json({ error: "missing required fields" });
    }
    try {
      const appt = await createAppointment({ clientName, phone, email, serviceId, date, time, notes });
      res.status(201).json(appt);
    } catch (err) {
      if (err.message === "SLOT_TAKEN") {
        return res.status(409).json({ error: "slot no longer available" });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { date, time, status } = req.body;
    try {
      const appt = await updateAppointment(Number(req.params.id), { date, time, status });
      res.json(appt);
    } catch (err) {
      if (err.message === "NOT_FOUND") return res.status(404).json({ error: "not found" });
      if (err.message === "SLOT_TAKEN") return res.status(409).json({ error: "slot no longer available" });
      throw err;
    }
  })
);

export default router;
