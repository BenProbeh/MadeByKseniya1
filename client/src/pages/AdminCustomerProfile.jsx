import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, MessageCircle, Phone, ShieldMinus, ShieldPlus, UserX } from "lucide-react";
import EmptyState from "../components/ui/EmptyState.jsx";
import { telHref } from "../lib/phone.js";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import { ScoreBreakdown } from "../components/admin/CustomerScore.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { MeasurementsSection, OrdersSection, ShipmentsSection } from "../components/profile/ProfileSections.jsx";
import { fetchAdminCustomer, removeCustomer, restoreCustomer, updateUserRole } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDate, formatDateTime } from "../lib/format.js";
import { isOwner } from "../lib/roles.js";

export default function AdminCustomerProfile() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | notFound | error
  const [error, setError] = useState("");

  const [pendingRole, setPendingRole] = useState(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [roleOk, setRoleOk] = useState("");

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeAck, setRemoveAck] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      setData(await fetchAdminCustomer(id));
      setStatus("ready");
    } catch (err) {
      const code = err?.response?.status;
      if (code === 404 || code === 400) {
        setStatus("notFound");
        return;
      }
      setError(getApiErrorMessage(err, "לא הצלחתי לטעון את הפרופיל."));
      setStatus("error");
      if (code === 401 || code === 403) await refreshUser();
    }
  }, [id, refreshUser]);

  useEffect(() => {
    setData(null);
    setRoleOk("");
    void load();
  }, [load]);

  const closeDialog = useCallback(() => {
    if (roleBusy) return;
    setPendingRole(null);
    setRoleError("");
  }, [roleBusy]);

  async function confirmRoleChange() {
    if (!pendingRole || roleBusy) return;
    setRoleBusy(true);
    setRoleError("");
    try {
      const res = await updateUserRole(data.customer.id, pendingRole);
      const name = `${res.customer.firstName} ${res.customer.lastName}`.trim();
      setData((prev) => ({ ...prev, customer: res.customer }));
      setRoleOk(
        res.customer.role === "admin" ? `${name} הוגדר כמנהל.` : `הרשאת המנהל של ${name} הוסרה.`
      );
      setPendingRole(null);
    } catch (err) {
      setRoleError(getApiErrorMessage(err, "לא הצלחתי לעדכן את ההרשאה. אפשר לנסות שוב."));
      const code = err?.response?.status;
      if (code === 401 || code === 403) await refreshUser();
    } finally {
      setRoleBusy(false);
    }
  }

  const closeRemove = useCallback(() => {
    if (removeBusy) return;
    setRemoveOpen(false);
    setRemoveAck(false);
    setRemoveError("");
  }, [removeBusy]);

  async function confirmRemove() {
    if (!removeAck || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError("");
    try {
      await removeCustomer(data.customer.id);
      navigate("/admin/customers", { replace: true });
    } catch (err) {
      setRemoveError(getApiErrorMessage(err, "לא הצלחתי להסיר את המשתמש. אפשר לנסות שוב."));
      const code = err?.response?.status;
      if (code === 401) await refreshUser();
      setRemoveBusy(false);
    }
  }

  async function onRestore() {
    if (restoreBusy) return;
    setRestoreBusy(true);
    setRestoreMsg("");
    try {
      await restoreCustomer(data.customer.id);
      await load();
      setRestoreMsg("החשבון שוחזר. המשתמש יכול להתחבר שוב.");
    } catch (err) {
      setRestoreMsg(getApiErrorMessage(err, "לא הצלחתי לשחזר את החשבון."));
    } finally {
      setRestoreBusy(false);
    }
  }

  if (status === "loading" && !data) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 pt-4" aria-hidden="true">
        <div className="skeleton h-24 w-24 rounded-full mx-auto" />
        <div className="skeleton h-7 w-48 mx-auto" />
        <div className="skeleton h-14 w-full rounded-card" />
        <div className="skeleton h-40 w-full rounded-card" />
      </div>
    );
  }

  if (status === "notFound") {
    return (
      <div className="max-w-2xl mx-auto pt-4">
        <div className="card">
          <EmptyState icon={UserX} title="הלקוחה לא נמצאה" text="ייתכן שהקישור שגוי או שהחשבון כבר לא קיים." />
        </div>
      </div>
    );
  }

  if (status === "error" && !data) {
    return (
      <div className="max-w-2xl mx-auto pt-4 space-y-4">
        <p className="notice-warning" role="alert">
          {error}
        </p>
        <button type="button" className="btn-ghost btn-block" onClick={() => void load()}>
          לנסות שוב
        </button>
      </div>
    );
  }

  const { customer, measurement, orders, shipments, permissions } = data;
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  const canManageRole = Boolean(permissions?.canManageRole) && isOwner(user) && customer.role !== "owner";
  const isSelf = customer.id === user?.id;
  const removed = Boolean(customer.removedAt);
  const canRemove = Boolean(permissions?.canRemove) && !isSelf && customer.role !== "owner";
  const canRestore = Boolean(permissions?.canRestore) && isOwner(user);
  const tel = telHref(customer.phoneE164);
  const whatsapp = customer.phoneE164 ? `https://wa.me/${customer.phoneE164.replace(/\D/g, "")}` : null;
  const mail = customer.email && customer.emailVerified ? `mailto:${customer.email}` : null;
  const contacts = [
    { href: tel, icon: Phone, label: "שיחה" },
    { href: whatsapp, icon: MessageCircle, label: "וואטסאפ", external: true },
    { href: mail, icon: Mail, label: "מייל" },
  ];
  const facts = [
    [
      "אימייל",
      customer.email ? (
        <>
          <bdi dir="ltr" className="break-all">
            {customer.email}
          </bdi>
          <span className="text-white/40"> · {customer.emailVerified ? "מאומת" : "לא מאומת"}</span>
        </>
      ) : (
        "עדיין לא נוסף"
      ),
    ],
    ["טלפון", customer.phone ? <span dir="ltr">{customer.phone}</span> : "לא נשמר"],
    ["הזמנות", <span className="tnum">{customer.ordersCount}</span>],
    ["התחברות אחרונה", customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : "—"],
    ["פעילות אחרונה", customer.lastActiveAt ? formatDateTime(customer.lastActiveAt) : "—"],
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-7 pt-2">
      <header className="flex flex-col items-center text-center gap-3">
        <UserAvatar user={customer} className="h-24 w-24 text-3xl" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="t-large-title">{fullName}</h1>
            <RoleBadge role={customer.role} />
          </div>
          <p className="t-foot">
            <span dir="ltr">@{customer.username}</span> · הצטרפה ב־{formatDate(customer.createdAt)}
          </p>
        </div>
      </header>

      {(tel || whatsapp || mail) && !removed && (
        <div className="grid grid-cols-3 gap-3" aria-label="יצירת קשר">
          {contacts.map(({ href, icon: Icon, label, external }) =>
            href ? (
              <a
                key={label}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="card flex flex-col items-center justify-center gap-1.5 min-h-[4.5rem] text-violet-200 active:bg-oled-800"
                aria-label={`${label} עם ${fullName}`}
              >
                <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                <span className="text-foot text-white/80">{label}</span>
              </a>
            ) : (
              <span key={label} className="card flex flex-col items-center justify-center gap-1.5 min-h-[4.5rem] text-white/20" aria-hidden="true">
                <Icon size={22} strokeWidth={1.8} />
                <span className="text-foot">{label}</span>
              </span>
            )
          )}
        </div>
      )}

      {removed && (
        <div role="note" className="notice-warning flex-col">
          <p>החשבון הוסר ב־{formatDateTime(customer.removedAt)}. הוא לא יכול להתחבר ולא מופיע ברשימת הלקוחות.</p>
          {canRestore && (
            <button type="button" className="btn-violet btn-sm" onClick={onRestore} disabled={restoreBusy}>
              {restoreBusy ? "רגע אחד…" : "שחזור החשבון"}
            </button>
          )}
        </div>
      )}
      {restoreMsg && (
        <p className="notice-info" role="status">
          {restoreMsg}
        </p>
      )}
      {roleOk && (
        <p className="notice-success" role="status">
          {roleOk}
        </p>
      )}

      <section className="space-y-2" aria-labelledby="facts-title">
        <h2 id="facts-title" className="t-title px-1">
          פרטים
        </h2>
        <dl className="list-group">
          {facts.map(([label, value]) => (
            <div key={label} className="list-row justify-between">
              <dt className="t-sub shrink-0">{label}</dt>
              <dd className="text-sub text-white text-end min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
        {!isSelf && <p className="t-foot px-1">תצוגה לקריאה בלבד — בלי כניסה לחשבון ובלי גישה לסיסמה.</p>}
      </section>

      <section className="space-y-2" aria-labelledby="score-title">
        <h2 id="score-title" className="t-title px-1">
          פעילות
        </h2>
        <div className="card p-4 space-y-3">
          <p className="t-foot">ציון פנימי לצוות בלבד, מחושב בשרת מתורים, מסלולים, רכישות ופעילות אחרונה.</p>
          <ScoreBreakdown score={customer.score} />
        </div>
      </section>

      <MeasurementsSection measurement={measurement} title="מידות" showActions={false} />
      <OrdersSection orders={orders} title="רכישות" />
      <ShipmentsSection shipments={shipments} title="משלוחים" />

      {(canManageRole || canRemove) && !removed && (
        <section className="space-y-2" aria-labelledby="manage-title">
          <h2 id="manage-title" className="t-title px-1">
            ניהול
          </h2>
          <div className="list-group">
            {canManageRole && customer.role === "customer" && (
              <button type="button" className="list-row" onClick={() => setPendingRole("admin")}>
                <ShieldPlus size={20} className="text-violet-200 shrink-0" aria-hidden="true" />
                <span className="flex-1">הגדרה כמנהלת</span>
              </button>
            )}
            {canManageRole && customer.role === "admin" && (
              <button type="button" className="list-row" onClick={() => setPendingRole("customer")}>
                <ShieldMinus size={20} className="text-violet-200 shrink-0" aria-hidden="true" />
                <span className="flex-1">הסרת הרשאת ניהול</span>
              </button>
            )}
            {canRemove && (
              <button type="button" className="list-row text-red-300" onClick={() => setRemoveOpen(true)}>
                <UserX size={20} className="shrink-0" aria-hidden="true" />
                <span className="flex-1">הסרת המשתמש</span>
              </button>
            )}
          </div>
          {canManageRole && <p className="t-foot px-1">רק הבעלים יכולה לתת או להסיר הרשאת ניהול.</p>}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingRole)}
        title={pendingRole === "admin" ? "הגדרה כמנהלת" : "הסרת הרשאת ניהול"}
        confirmLabel={pendingRole === "admin" ? "כן, להגדיר" : "כן, להסיר"}
        tone={pendingRole === "admin" ? "default" : "danger"}
        busy={roleBusy}
        error={roleError}
        onConfirm={confirmRoleChange}
        onCancel={closeDialog}
      >
        {pendingRole === "admin" ? (
          <>
            <p>{fullName} תוכל לראות את רשימת הלקוחות, הפרופילים, המידות, ההזמנות והתורים, ולאשר בקשות.</p>
            <p>מנהלת לא רואה סיסמאות, לא משנה הרשאות ולא נוגעת בחשבון הבעלים.</p>
          </>
        ) : (
          <p>{fullName} תחזור להיות לקוחה רגילה ותאבד מיד את הגישה לאזור הניהול.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={removeOpen}
        title={`הסרת ${fullName}`}
        confirmLabel="כן, להסיר"
        tone="danger"
        busy={removeBusy}
        confirmDisabled={!removeAck}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
      >
        <p>החשבון יוסר מרשימת הלקוחות וכל ההתחברויות שלו ינותקו מיד.</p>
        <p>התורים, ההזמנות והמידות נשמרים. הבעלים יכולה לשחזר את החשבון בכל עת.</p>
        <label className="flex items-center gap-3 pt-2 min-h-[2.75rem] cursor-pointer select-none text-white/85">
          <input type="checkbox" className="check" checked={removeAck} onChange={(e) => setRemoveAck(e.target.checked)} disabled={removeBusy} />
          <span>הבנתי, להסיר את המשתמש</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
