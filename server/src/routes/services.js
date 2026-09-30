import { Router } from "express";
import { listServices } from "../appointmentsService.js";
import { asyncRoute } from "../http.js";

const router = Router();

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await listServices());
  })
);

export default router;
