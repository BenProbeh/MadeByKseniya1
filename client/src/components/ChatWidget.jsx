import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import Sheet from "./ui/Sheet.jsx";
import { sendChatMessage } from "../lib/api.js";
import { getApiErrorMessage } from "../lib/authErrors.js";

const WELCOME = {
  role: "assistant",
  content: "היי! אני הקונסיירז' של MadeByKseniya. אפשר לשאול אותי איזה מסלול מתאים לך, לבדוק שעות פנויות או לשאול כל דבר על הטיפול.",
};

/** Concierge chat in a sheet. Opened from the app bar (phones) or the round button (desktop). */
export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener("mbk:open-chat", open);
    return () => window.removeEventListener("mbk:open-chat", open);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, isOpen]);

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
        .filter((m) => m !== WELCOME && (m.role === "user" || m.role === "assistant"))
        .map(({ role, content }) => ({ role, content }));
      const { reply } = await sendChatMessage(apiMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(getApiErrorMessage(err, "משהו השתבש, אפשר לנסות שוב בעוד רגע."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="hidden md:flex fixed z-30 bottom-6 left-6 w-14 h-14 rounded-full btn-violet p-0"
        aria-label="שאלה לקונסיירז'"
      >
        <MessageCircle size={24} strokeWidth={1.9} aria-hidden="true" />
      </button>

      <Sheet
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="קונסיירז'"
        description="תשובות על מסלולים, שעות וטיפול."
        initialFocusRef={inputRef}
        size="lg"
        footer={
          <form onSubmit={handleSend} className="flex gap-2 w-full">
            <label htmlFor="chat-input" className="sr-only">
              הודעה
            </label>
            <input
              id="chat-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="כתבי הודעה…"
              maxLength={1000}
              enterKeyHint="send"
              className="input flex-1 min-w-0 rounded-full"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-violet w-[3.25rem] px-0 shrink-0"
              aria-label="שליחה"
            >
              <ArrowUp size={22} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </form>
        }
      >
        <div className="space-y-3 min-h-[40dvh]" aria-live="polite">
          {messages.map((m, i) => (
            <p
              key={i}
              className={`w-fit max-w-[85%] px-4 py-2.5 rounded-[1.25rem] text-sub leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "ms-auto bg-violet-400/25 text-white rounded-ee-md"
                  : "bg-white/[0.07] text-white/90 rounded-es-md"
              }`}
            >
              {m.content}
            </p>
          ))}
          {loading && (
            <p className="w-fit px-4 py-2.5 rounded-[1.25rem] bg-white/[0.07] text-white/55 text-sub">כותבת תשובה…</p>
          )}
          {error && <p className="notice-error">{error}</p>}
          <div ref={scrollRef} />
        </div>
      </Sheet>
    </>
  );
}
