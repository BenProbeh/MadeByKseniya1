/** Express 4 does not catch rejected promises from async handlers; forward them to the error middleware. */
export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function sendServiceUnavailable(res) {
  const message = "השירות אינו זמין כרגע. נסי שוב בעוד רגע.";
  return res.status(503).json({
    success: false,
    error: { code: "DB_UNAVAILABLE", message },
    errorMessage: message,
  });
}
