import { Router } from "express";
import {
  getAvailability,
  createAppointment,
  findAppointmentsByPhone,
  updateAppointment,
} from "../appointmentsService.js";

const router = Router();

router.get("/availability", (req, res) => {
  const { date, serviceId } = req.query;
  if (!date || !serviceId) {
    return res.status(400).json({ error: "date and serviceId are required" });
  }
  res.json(getAvailability(date, Number(serviceId)));
});

router.get("/", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "phone is required" });
  res.json(findAppointmentsByPhone(phone));
});

router.post("/", (req, res) => {
  const { clientName, phone, email, serviceId, date, time, notes } = req.body;
  if (!clientName || !phone || !serviceId || !date || !time) {
    return res.status(400).json({ error: "missing required fields" });
  }
  try {
    const appt = createAppointment({ clientName, phone, email, serviceId, date, time, notes });
    res.status(201).json(appt);
  } catch (err) {
    if (err.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "slot no longer available" });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

router.patch("/:id", (req, res) => {
  const { date, time, status } = req.body;
  try {
    const appt = updateAppointment(Number(req.params.id), { date, time, status });
    res.json(appt);
  } catch (err) {
    if (err.message === "NOT_FOUND") return res.status(404).json({ error: "not found" });
    if (err.message === "SLOT_TAKEN") return res.status(409).json({ error: "slot no longer available" });
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
