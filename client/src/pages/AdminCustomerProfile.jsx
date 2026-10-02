import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import DialButton from "../components/admin/DialButton.jsx";
import { ScoreBreakdown } from "../components/admin/CustomerScore.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { MeasurementsSection, OrdersSection, ShipmentsSection } from "../components/profile/ProfileSections.jsx";
import { fetchAdminCustomer, removeCustomer, restoreCustomer, updateUserRole } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDate, formatDateTime } from "../lib/format.js";
import { isOwner } from "../lib/roles.js";

function BackLink() {
  return (
    <Link to="/admin/customers" className="btn-text text-sm">
      <span aria-hidden="true">→</span>
      חזרה לרשימת הלקוחות
    </Link>
  );
}

function Detail({ label, children }) {
  return (
    <div className="border border-white/[0.08] rounded-xl px-4 py-3 space-y-1 min-w-0">
      <dt className="text-[11px] text-white/40">{label}</dt>
      <dd className="text-sm text-white/80 truncate">{children}</dd>
    </div>
  );
}

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
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-white/45 text-center">הפרופיל נטען…</p>
      </div>
    );
  }

  if (status === "notFound") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6 text-center">
        <section className="glass-panel p-8 space-y-3">
          <h1 className="font-serif text-2xl text-white">הלקוח לא נמצא</h1>
          <p className="font-serif text-sm text-white/55">ייתכן שהקישור שגוי או שהחשבון כבר לא קיים.</p>
        </section>
        <BackLink />
      </div>
    );
  }

  if (status === "error" && !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6 text-center">
        <section className="glass-panel p-8 space-y-4">
          <p className="text-sm text-amber-200" role="alert">
            {error}
          </p>
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            לנסות שוב
          </button>
        </section>
        <BackLink />
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

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <div className="flex justify-center">
        <BackLink />
      </div>

      {removed && (
        <div role="note" className="glass-panel border-white/20 px-5 py-4 text-center font-serif text-sm text-white/75 space-y-3">
          <p>
            החשבון הזה הוסר ב־{formatDateTime(customer.removedAt)}. הוא לא יכול להתחבר ולא מופיע ברשימת הלקוחות.
          </p>
          {canRestore && (
            <button type="button" className="btn-violet" onClick={onRestore} disabled={restoreBusy}>
              {restoreBusy ? "רגע אחד…" : "שחזור החשבון"}
            </button>
          )}
        </div>
      )}
      {restoreMsg && (
        <p className="text-sm text-violet-200 text-center" role="status" aria-live="polite">
          {restoreMsg}
        </p>
      )}

      {!isSelf && (
        <div
          role="note"
          className="glass-panel border-violet-400/40 px-5 py-4 text-center font-serif text-sm text-violet-100"
        >
          מצב צפייה בפרופיל של <strong className="text-white">{fullName}</strong>. תצוגה לקריאה בלבד — ללא כניסה
          לחשבון וללא גישה לסיסמה.
        </div>
      )}

      <section className="glass-panel p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
          <UserAvatar user={customer} className="h-24 w-24 md:h-28 md:w-28 text-3xl" />
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <h1 className="font-serif text-2xl md:text-3xl text-white">{fullName}</h1>
              <RoleBadge role={customer.role} />
            </div>
            <p className="text-sm text-white/50">
              <span dir="ltr">@{customer.username}</span>
            </p>
            {customer.phoneE164 && (
              <div className="flex justify-center sm:justify-start">
                <DialButton phoneE164={customer.phoneE164} phoneDisplay={customer.phone} name={fullName} />
              </div>
            )}
            <p className="text-xs text-white/35">הצטרפות ב־{formatDate(customer.createdAt)}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Detail label="אימייל">
            {customer.email ? (
              <>
                <bdi dir="ltr" className="break-all">
                  {customer.email}
                </bdi>
                <span className="text-white/40"> · {customer.emailVerified ? "מאומת" : "לא מאומת"}</span>
              </>
            ) : (
              "עדיין לא נוסף"
            )}
          </Detail>
          <Detail label="טלפון ליצירת קשר">
            {customer.phone ? <span dir="ltr">{customer.phone}</span> : "לא נשמר"}
          </Detail>
          <Detail label="הזמנות">{customer.ordersCount}</Detail>
          <Detail label="התחברות אחרונה">
            {customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : "—"}
          </Detail>
          <Detail label="פעילות אחרונה">
            {customer.lastActiveAt ? formatDateTime(customer.lastActiveAt) : "—"}
          </Detail>
        </dl>

        {canManageRole && (
          <div className="flex flex-wrap justify-center sm:justify-start gap-3">
            {customer.role === "customer" && (
              <button type="button" className="btn-violet" onClick={() => setPendingRole("admin")}>
                הגדר כמנהל
              </button>
            )}
            {customer.role === "admin" && (
              <button type="button" className="btn-ghost" onClick={() => setPendingRole("customer")}>
                הסר הרשאת מנהל
              </button>
            )}
          </div>
        )}

        {roleOk && (
          <p className="text-sm text-violet-200 text-center sm:text-right" role="status" aria-live="polite">
            {roleOk}
          </p>
        )}

        {canRemove && (
          <div className="border-t border-white/[0.08] pt-5 flex justify-center sm:justify-start">
            <button type="button" className="btn-text text-sm text-white/60" onClick={() => setRemoveOpen(true)}>
              הסרת משתמש
            </button>
          </div>
        )}
      </section>

      <section className="glass-panel p-6 md:p-8 space-y-4" aria-labelledby="score-title">
        <div className="space-y-1">
          <h2 id="score-title" className="font-serif text-2xl text-white">
            דירוג פנימי
          </h2>
          <p className="text-xs text-white/45">גלוי לצוות בלבד. מחושב בשרת לפי פעילות עסקית.</p>
        </div>
        <ScoreBreakdown score={customer.score} />
      </section>

      <MeasurementsSection
        measurement={measurement}
        title="מידות"
        subtitle=""
        emptyTitle="עדיין לא נשמרו מידות"
        emptyText=""
        showActions={false}
      />
      <OrdersSection orders={orders} title="רכישות" emptyText="אין רכישות עדיין." />
      <ShipmentsSection shipments={shipments} title="משלוחים" emptyText="אין משלוחים פעילים." />

      <ConfirmDialog
        open={Boolean(pendingRole)}
        title={pendingRole === "admin" ? "הגדרה כמנהל" : "הסרת הרשאת מנהל"}
        confirmLabel={pendingRole === "admin" ? "כן, הגדר כמנהל" : "כן, הסר הרשאה"}
        busy={roleBusy}
        error={roleError}
        onConfirm={confirmRoleChange}
        onCancel={closeDialog}
      >
        {pendingRole === "admin" ? (
          <>
            <p>
              {fullName} יוכל לצפות ברשימת הלקוחות, בפרופילים, במידות, בהזמנות ובנתוני ההצטרפות.
            </p>
            <p>מנהל לא יכול לראות סיסמאות, לשנות הרשאות או לגעת בחשבון הבעלים.</p>
          </>
        ) : (
          <p>{fullName} יחזור להיות לקוח רגיל ויאבד מיד את הגישה לאזור הניהול.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={removeOpen}
        title={`הסרת ${fullName}`}
        confirmLabel="כן, הסר את המשתמש"
        busy={removeBusy}
        confirmDisabled={!removeAck}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={closeRemove}
      >
        <p>
          החשבון של <strong className="text-white">{fullName}</strong> יוסר מרשימת הלקוחות וכל ההתחברויות שלו
          ינותקו מיד. לא תהיה אפשרות להתחבר אליו.
        </p>
        <p>התורים, ההזמנות והמידות נשמרים במערכת. מספר הטלפון נשאר שמור ולא ניתן להירשם איתו מחדש.</p>
        <p>בעלת האתר יכולה לשחזר את החשבון בכל עת.</p>
        <label className="flex items-center justify-center gap-2 pt-2 cursor-pointer select-none text-white/80">
          <input
            type="checkbox"
            checked={removeAck}
            onChange={(e) => setRemoveAck(e.target.checked)}
            disabled={removeBusy}
            className="rounded border-white/30"
          />
          <span>הבנתי, אני רוצה להסיר את המשתמש</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
