import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, Ellipsis, House, LayoutGrid, Ruler, UserRound, UsersRound } from "lucide-react";

export const TAB_ICONS = {
  home: House,
  measure: Ruler,
  appointments: CalendarDays,
  profile: UserRound,
  dashboard: LayoutGrid,
  customers: UsersRound,
  more: Ellipsis,
};

/** Phone bottom navigation: four destinations, 64px tall, thumb-reachable, safe-area aware; the current tab is lit like a marquee bulb. */
export default function TabBar({ tabs, badges = {}, label }) {
  const { pathname } = useLocation();
  return (
    <nav className="app-tabbar" aria-label={label}>
      <ul className="grid grid-cols-4 h-[var(--tabbar-h)]">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.icon];
          const active = tab.match(pathname);
          const count = tab.badge ? badges[tab.badge] || 0 : 0;
          return (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 font-display text-[0.6875rem] tracking-wide transition-colors ${
                  active ? "text-violet-300" : "text-white/50 active:text-white/80"
                }`}
              >
                {active && <span className="tab-light" aria-hidden="true" />}
                <span className={`relative ${active ? "tab-icon-lit" : ""}`}>
                  <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
                  {count > 0 && (
                    <span
                      className="absolute -top-1.5 -start-2.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-violet-400 text-[0.6875rem] leading-[1.125rem] text-center font-sans font-bold tnum"
                      style={{ color: "#fff" }}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
                <span>{tab.label}</span>
                {count > 0 && <span className="sr-only">{`, ${count} ממתינות`}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
