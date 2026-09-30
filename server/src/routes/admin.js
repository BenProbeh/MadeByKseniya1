import { Router } from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { asyncRoute } from "../http.js";
import { computeCustomerStats, getCustomerSummary, listCustomers } from "../adminService.js";
import { loadMeasurement, loadOrders, loadShipments } from "../profileData.js";
import { ROLES } from "../roles.js";

const router = Router();

router.use(requireAdmin);

function badRequest(res, message) {
  return res.status(400).json({ success: false, code: "VALIDATION_ERROR", error: message, errorMessage: message });
}

export function parseUserId(raw) {
  const value = String(raw ?? "");
  if (!/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

function parseListQuery(query) {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search.length > 100) return { error: "החיפוש ארוך מדי." };

  const role = typeof query.role === "string" ? query.role : "";
  if (role && !Object.values(ROLES).includes(role)) return { error: "סינון תפקיד לא חוקי." };

  const sort = typeof query.sort === "string" && query.sort ? query.sort : "newest";
  if (sort !== "newest" && sort !== "oldest") return { error: "מיון לא חוקי." };

  const page = query.page == null || query.page === "" ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return { error: "מספר עמוד לא חוקי." };

  const pageSize = query.pageSize == null || query.pageSize === "" ? 20 : Number(query.pageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return { error: "גודל עמוד לא חוקי." };

  return { value: { search, role, sort, page, pageSize } };
}

router.get(
  "/customers",
  asyncRoute(async (req, res) => {
    const parsed = parseListQuery(req.query);
    if (parsed.error) return badRequest(res, parsed.error);
    return res.json({ success: true, ...(await listCustomers(parsed.value)) });
  })
);

router.get(
  "/customers/:id",
  asyncRoute(async (req, res) => {
    const id = parseUserId(req.params.id);
    if (!id) return badRequest(res, "מזהה לקוח לא חוקי.");

    const customer = await getCustomerSummary(id);
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, code: "NOT_FOUND", error: "הלקוח לא נמצא.", errorMessage: "הלקוח לא נמצא." });
    }

    const [measurement, orders, shipments] = await Promise.all([
      loadMeasurement(id),
      loadOrders(id),
      loadShipments(id),
    ]);

    const canManageRole =
      req.user.role === ROLES.OWNER && customer.role !== ROLES.OWNER && customer.id !== req.user.id;

    return res.json({
      success: true,
      customer,
      measurement,
      orders,
      shipments,
      permissions: { canManageRole },
    });
  })
);

router.get(
  "/customer-stats",
  asyncRoute(async (_req, res) => {
    return res.json({ success: true, stats: await computeCustomerStats() });
  })
);

export default router;
