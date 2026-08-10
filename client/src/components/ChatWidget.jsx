import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { sendChatMessage } from "../lib/api.js";

const WELCOME = {
  role: "assistant",
  content:
    "היי! אני הקונסיירז' הדיגיטלי של MadeByKseniya 💅 אפשר לשאול אותי מה הכי מתאים לך, לבדוק זמינות או להזיז תור קיים.",
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const apiMessages = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map(({ role, content }) => ({ role, content }));
      const { reply } = await sendChatMessage(apiMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err?.response?.data?.error || "משהו השתבש, נסי שוב בעוד רגע.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <motion.button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed z-50 w-14 h-14 rounded-full bg-violet-gradient shadow-glow flex items-center justify-center text-oled-950 text-2xl"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
          left: "calc(env(safe-area-inset-left) + 1.5rem)",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="פתיחת צ'אט"
      >
        {isOpen ? "✕" : "💬"}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 w-[92vw] max-w-sm h-[min(32rem,75vh)] glass-panel flex flex-col overflow-hidden shadow-glow-lg"
            style={{
              bottom: "calc(env(safe-area-inset-bottom) + 6rem)",
              left: "calc(env(safe-area-inset-left) + 1.5rem)",
            }}
          >
            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
              <p className="font-bold text-sm">
                MadeBy<span className="violet-text">Kseniya</span> · קונסיירז' AI
              </p>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-violet-gradient text-oled-950 mr-auto rounded-bl-sm"
                      : "bg-white/10 text-white/90 ml-auto rounded-br-sm"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="ml-auto max-w-[70%] px-3 py-2 rounded-2xl text-sm bg-white/10 text-white/60">
                  כותבת תשובה...
                </div>
              )}
              {error && <p className="text-xs text-red-300 text-center">{error}</p>}
            </div>

            <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="כתבי הודעה..."
                className="flex-1 min-w-0 min-h-[44px] bg-white/5 border border-white/10 rounded-full px-4 text-base outline-none focus:border-violet-400/60"
              />
              <button
                type="submit"
                disabled={loading}
                className="btn-violet px-5 min-h-[44px] text-sm disabled:opacity-50 shrink-0"
              >
                שלח
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
