import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronLeft, FileText, Store, UserRound } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import MailConnectionSection from "../components/profile/MailConnectionSection.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchUnreadNotificationCount } from "../lib/authApi.js";
import { isOwner } from "../lib/roles.js";

function Row({ to, icon: Icon, title, detail, badge }) {
  return (
    <Link to={to} className="list-row">
      <span className="grid place-items-center w-9 h-9 rounded-[0.625rem] bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
        <Icon size={19} strokeWidth={1.8} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-body text-white">{title}</span>
        {detail && <span className="block t-foot">{detail}</span>}
      </span>
      {badge > 0 && (
        <span className="min-w-[1.5rem] h-6 px-2 rounded-full bg-violet-400 text-foot font-bold leading-6 text-center tnum" style={{ color: "#fff" }}>
          {badge}
        </span>
      )}
      <ChevronLeft size={20} className="text-white/30 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Staff settings and the less frequent tools; owner-only items appear only for the owner. */
export default function AdminMore() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const owner = isOwner(user);

  useEffect(() => {
    fetchUnreadNotificationCount()
      .then(setUnread)
      .catch(() => setUnread(0));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-7 pt-2">
      <PageHeader
        title="עוד"
        subtitle={
          <span className="inline-flex items-center gap-2">
            {user?.firstName} {user?.lastName} <RoleBadge role={user?.role} />
          </span>
        }
      />

      <div className="list-group">
        <Row to="/admin/notifications" icon={Bell} title="התראות" detail="בקשות חדשות ועדכונים" badge={unread} />
        <Row to="/admin/content" icon={FileText} title="ניהול תוכן" detail="עמודי מידע באפליקציה" />
      </div>

      <div className="list-group">
        <Row to="/profile" icon={UserRound} title="הפרופיל שלי" detail="סיסמה, אימייל ותמונה" />
        <Row to="/" icon={Store} title="מעבר לאפליקציה" detail="מה שהלקוחות רואות" />
      </div>

      {owner && (
        <section className="space-y-2" aria-labelledby="mail-title">
          <h2 id="mail-title" className="section-title">
            שליחת מיילים · לבעלים בלבד
          </h2>
          <div className="card p-5">
            <MailConnectionSection />
          </div>
        </section>
      )}
    </div>
  );
}
