import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, MessageCircle, Settings2, Store } from "lucide-react";
import Logo from "../Logo.jsx";
import UserAvatar from "../UserAvatar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { isStaff } from "../../lib/roles.js";
import { routeMeta } from "../../lib/navigation.js";

/** Opens the concierge chat (ChatWidget listens). */
export function openChat() {
  window.dispatchEvent(new CustomEvent("mbk:open-chat"));
}

/**
 * Minimal app bar: back (nested screens) or the logo, a short title, and at most two actions.
 * Turns solid with a hairline only after the content scrolls under it. Desktop adds the main links.
 */
export default function TopBar({ tabs, staffArea, chatEnabled }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  // The large page title scrolls away first; then its short version appears in the bar (iOS pattern).
  const [titleInBar, setTitleInBar] = useState(false);
  const meta = routeMeta(pathname);
  const staff = isStaff(user);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      setTitleInBar(window.scrollY > 56);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  function goBack() {
    // Return to where she came from when that's inside the app, otherwise to the parent screen.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(meta.back, { replace: true });
  }

  return (
    <header className="app-topbar" data-scrolled={scrolled}>
      <div className="mx-auto max-w-content h-[var(--header-h)] flex items-center gap-2 ps-[max(0.5rem,var(--safe-right))] pe-[max(0.5rem,var(--safe-left))] md:px-6">
        <div className="flex items-center min-w-0 flex-1 md:flex-none">
          {meta.back ? (
            <button type="button" onClick={goBack} className="icon-btn" aria-label="חזרה">
              <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <Link to={staffArea ? "/admin" : "/"} className="flex items-center gap-2 ps-2 min-h-[2.75rem]" aria-label="MadeByKseniya — בית">
              <Logo className="h-9 w-auto" />
              {staffArea && <span className="font-display text-sub text-white/70">ניהול</span>}
            </Link>
          )}
          {meta.back && meta.title && (
            <p
              className={`t-headline truncate ms-1 md:hidden transition-opacity duration-200 ${titleInBar ? "opacity-100" : "opacity-0"}`}
              aria-hidden={!titleInBar}
            >
              {meta.title}
            </p>
          )}
        </div>

        <nav className="hidden md:flex flex-1 items-center justify-center gap-1" aria-label={staffArea ? "ניווט ניהול" : "ניווט ראשי"}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`font-display text-sub px-4 min-h-[2.75rem] inline-flex items-center rounded-full transition-colors ${
                tab.match(pathname) ? "text-white bg-white/[0.07]" : "text-white/60 hover:text-white"
              }`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          {chatEnabled && !staffArea && (
            <button type="button" className="icon-btn" onClick={openChat} aria-label="שאלה לקונסיירז'">
              <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          {staff &&
            (staffArea ? (
              <Link to="/" className="btn-ghost btn-sm gap-1.5 px-3.5">
                <Store size={17} strokeWidth={1.9} aria-hidden="true" />
                לאפליקציה
              </Link>
            ) : (
              <Link to="/admin" className="btn-ghost btn-sm gap-1.5 px-3.5">
                <Settings2 size={17} strokeWidth={1.9} aria-hidden="true" />
                ניהול
              </Link>
            ))}
          <Link to="/profile" className="hidden md:inline-flex icon-btn" aria-label="פרופיל">
            <UserAvatar user={user} className="h-8 w-8 text-sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}
