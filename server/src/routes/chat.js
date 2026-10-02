import { Router } from "express";
import { runChat } from "../openaiAgent.js";
import { optionalAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", optionalAuth, async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  try {
    const reply = await runChat(messages, { userId: req.user?.id || null });
    res.json({ reply });
  } catch (err) {
    if (err.message === "MISSING_API_KEY" || err.status === 401) {
      return res.status(503).json({
        error: "AI chat is not configured yet. Add a real OPENAI_API_KEY to server/.env and restart the server.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
