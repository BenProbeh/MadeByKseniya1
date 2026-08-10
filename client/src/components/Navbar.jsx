import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Logo from "./Logo.jsx";

const links = [
  { to: "/", label: "בית" },
  { to: "/services", label: "שירותים" },
  { to: "/gallery", label: "גלריה" },
  { to: "/build-a-set", label: "עצבי סט" },
  { to: "/about", label: "אודות" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-all duration-500 ease-editorial ${
        scrolled
          ? "bg-oled-950/85 backdrop-blur-md border-b border-white/[0.08] pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-3.5"
          : "bg-gradient-to-b from-oled-950/70 via-oled-950/10 to-transparent pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-6"
      }`}
    >
      <nav className="max-w-content mx-auto pl-[calc(env(safe-area-inset-left)+1.5rem)] pr-[calc(env(safe-area-inset-right)+1.5rem)] md:pl-[calc(env(safe-area-inset-left)+2.5rem)] md:pr-[calc(env(safe-area-inset-right)+2.5rem)] flex items-center justify-between">
        <NavLink to="/" onClick={() => setOpen(false)} className="shrink-0">
          <Logo className="h-[60px] w-auto md:h-[70px]" />
        </NavLink>

        <div className="hidden md:flex items-center gap-10 text-base tracking-wide font-medium text-white/70">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `font-nav relative py-1 transition-colors duration-300 hover:text-violet-200 ${
                  isActive ? "text-violet-200" : ""
                } after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-violet-400/70 after:origin-right after:transition-transform after:duration-500 after:ease-editorial ${
                  isActive ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            className="md:hidden relative w-11 h-11 flex items-center justify-center text-white/80"
            aria-label={open ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="relative w-5 h-3.5 block">
              <span
                className={`absolute inset-x-0 top-0 h-px bg-current transition-transform duration-300 ease-editorial ${
                  open ? "translate-y-[7px] rotate-45" : ""
                }`}
              />
              <span
                className={`absolute inset-x-0 bottom-0 h-px bg-current transition-transform duration-300 ease-editorial ${
                  open ? "-translate-y-[7px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden mx-6 mt-4 glass-panel p-6 flex flex-col gap-5 text-base"
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `font-nav tracking-wide transition-colors ${isActive ? "text-violet-200" : "text-white/75"}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/booking" onClick={() => setOpen(false)} className="btn-violet w-full mt-2">
              קביעת תור
            </NavLink>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
