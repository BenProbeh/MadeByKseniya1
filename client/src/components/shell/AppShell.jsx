import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import TopBar from "./TopBar.jsx";
import TabBar from "./TabBar.jsx";
import NetworkBanner from "./NetworkBanner.jsx";
import Footer from "../Footer.jsx";
import ChatWidget from "../ChatWidget.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { isStaff } from "../../lib/roles.js";
import { CUSTOMER_TABS, STAFF_TABS, isChromeless, isStaffArea } from "../../lib/navigation.js";
import { useKeyboardAwareness } from "../../lib/useViewportState.js";
import { fetchAdminAppointments } from "../../lib/authApi.js";

const BADGE_REFRESH_MS = 60_000;

/** Pending booking requests for the staff "תורים" tab badge. */
function usePendingCount(enabled, pathname) {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const load = () =>
      fetchAdminAppointments({ status: "pending", scope: "upcoming" })
        .then((data) => active && setPending(Number(data?.counts?.pending) || 0))
        .catch(() => {});
    load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(), BADGE_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, pathname]);
  return pending;
}

/**
 * The app frame: minimal top bar, the screen, and a bottom tab bar on phones (customer or staff set).
 * Auth screens render bare. Content is padded for the notch, the bars and the home indicator.
 */
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const { user, authenticated } = useAuth();
  useKeyboardAwareness();

  const chromeless = isChromeless(pathname) || !authenticated;
  const staffArea = isStaffArea(pathname) && isStaff(user);
  const tabs = staffArea ? STAFF_TABS : CUSTOMER_TABS;
  const pending = usePendingCount(staffArea, pathname);

  if (chromeless) {
    // overflow-x-clip: decorative glows (the logo's stage light) end at the screen edge instead of widening the page.
    return (
      <div className="min-h-[100dvh] flex flex-col overflow-x-clip">
        <div className="ambient-light" aria-hidden="true" />
        <NetworkBanner />
        <main
          id="main"
          className="flex-1 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+1.5rem)] ps-[max(var(--gutter),var(--safe-right))] pe-[max(var(--gutter),var(--safe-left))]"
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-clip">
      <div className="ambient-light" aria-hidden="true" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[70] btn-ghost btn-sm">
        דילוג לתוכן
      </a>
      <NetworkBanner />
      <TopBar tabs={tabs} staffArea={staffArea} chatEnabled />
      <main id="main" className="app-content flex-1">
        <div key={pathname} className="route-enter mx-auto w-full max-w-content">
          {children}
        </div>
      </main>
      {!staffArea && <Footer />}
      <TabBar tabs={tabs} badges={{ pending }} label={staffArea ? "ניווט ניהול" : "ניווט ראשי"} />
      {!staffArea && <ChatWidget />}
    </div>
  );
}
