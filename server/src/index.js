import "dotenv/config";
import express from "express";
import cors from "cors";
import servicesRouter from "./routes/services.js";
import appointmentsRouter from "./routes/appointments.js";
import chatRouter from "./routes/chat.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/services", servicesRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/chat", chatRouter);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`made by kseniya API running on http://localhost:${PORT}`);
});
