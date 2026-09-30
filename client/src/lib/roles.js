// UI hints only — every permission is enforced again by the server on each request.
export const ROLE_LABELS_HE = {
  owner: "בעלים",
  admin: "מנהל",
  customer: "לקוח",
};

export function roleLabel(role) {
  return ROLE_LABELS_HE[role] || ROLE_LABELS_HE.customer;
}

export function isStaff(user) {
  return user?.role === "owner" || user?.role === "admin";
}

export function isOwner(user) {
  return user?.role === "owner";
}
