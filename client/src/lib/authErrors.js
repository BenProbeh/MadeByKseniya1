/** Extract a safe Hebrew string from axios / fetch errors (never return objects). */
export function getApiErrorMessage(err, fallback = "משהו השתבש. נסי שוב.") {
  const data = err?.response?.data;
  const raw = data?.error ?? data?.errorMessage ?? data?.message ?? err?.message;
  if (typeof raw === "string" && raw.trim()) {
    if (raw === "Network Error") return "לא הצלחנו להתחבר לשרת. בדקי את החיבור ונסי שוב.";
    return raw;
  }
  if (raw && typeof raw === "object" && typeof raw.message === "string") {
    return raw.message;
  }
  return fallback;
}

export function assertUser(user) {
  if (!user || user.id == null || !user.username) {
    const err = new Error("השרת לא החזיר משתמש תקין");
    err.code = "INVALID_USER";
    throw err;
  }
  return user;
}
