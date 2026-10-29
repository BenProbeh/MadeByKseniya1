import { Router } from "express";
import rateLimit from "express-rate-limit";
import { runChat } from "../openaiAgent.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

const MAX_MESSAGES = 30;
const MAX_CHARS = 1000;

/** Signed-in customers only, and a per-account budget, so the concierge can't be used as a free AI proxy. */
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `chat:${req.user.id}`,
  message: { error: "הגעת למגבלת ההודעות לשעה. אפשר להמשיך בעוד קצת." },
});

/**
 * Only plain user/assistant text from the client. System prompts and tool results are created on the
 * server; a client can't inject its own.
 */
export function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    clean.push({ role: m.role, content });
  }
  return clean[clean.length - 1].role === "user" ? clean : null;
}

router.post("/", requireAuth, chatLimiter, async (req, res) => {
  const messages = sanitizeChatMessages(req.body?.messages);
  if (!messages) return res.status(400).json({ error: "messages array is required" });

  try {
    const reply = await runChat(messages, { userId: req.user.id });
    res.json({ reply });
  } catch (err) {
    if (err.message === "MISSING_API_KEY" || err.status === 401) {
      return res.status(503).json({ error: "הקונסיירז' עדיין לא מחובר. אפשר לכתוב לי ישירות ואענה בהקדם." });
    }
    console.error("[chat] failed:", err?.status || "", err?.code || err?.name || "error");
    res.status(500).json({ error: "משהו השתבש, אפשר לנסות שוב בעוד רגע." });
  }
});

export default router;
