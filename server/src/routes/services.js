import { Router } from "express";
import { listServices } from "../appointmentsService.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(listServices());
});

export default router;
