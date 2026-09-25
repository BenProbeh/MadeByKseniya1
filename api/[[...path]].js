/**
 * Vercel serverless reverse-proxy for the Railway Express API.
 *
 * Production frontend calls same-origin `/api/*`. This function forwards to
 * `API_ORIGIN` (e.g. https://your-service.up.railway.app) so cookies stay
 * first-party on the Vercel domain and no VITE_API_URL rebuild is required.
 *
 * Set in Vercel → Settings → Environment Variables (Production):
 *   API_ORIGIN=https://<your-railway-host>
 * (no trailing slash; do not include `/api`)
 */
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
  maxDuration: 30,
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function unsetApiMessage() {
  return {
    success: false,
    error: {
      code: "API_UNCONFIGURED",
      message: "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע.",
    },
  };
}

function pickForwardHeaders(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const k = key.toLowerCase();
    if (
      k === "host" ||
      k === "connection" ||
      k === "content-length" ||
      k === "transfer-encoding" ||
      k === "accept-encoding"
    ) {
      continue;
    }
    if (value != null) out[k] = value;
  }
  return out;
}

function rewriteSetCookie(value) {
  // Drop Domain so the browser binds the cookie to the Vercel host.
  return String(value)
    .split(/,(?=[^;]+?=)/)
    .map((part) =>
      part
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !/^domain=/i.test(s))
        .join("; ")
    )
    .join(", ");
}

export default async function handler(req, res) {
  const origin = String(process.env.API_ORIGIN || process.env.BACKEND_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!origin) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(unsetApiMessage()));
    return;
  }

  try {
    const incoming = req.url && req.url.startsWith("/") ? req.url : `/${req.url || ""}`;
    const targetUrl = `${origin}${incoming}`;
    const method = req.method || "GET";
    const headers = pickForwardHeaders(req);
    const hasBody = !["GET", "HEAD"].includes(method.toUpperCase());
    const body = hasBody ? await readRawBody(req) : undefined;

    if (hasBody && body?.length) {
      headers["content-length"] = String(body.length);
    }

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    res.statusCode = upstream.status;

    const setCookies =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : [];

    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "transfer-encoding" || k === "content-encoding" || k === "content-length") {
        return;
      }
      if (k === "set-cookie") {
        return;
      }
      res.setHeader(key, value);
    });

    if (setCookies.length) {
      res.setHeader(
        "set-cookie",
        setCookies.map((c) => rewriteSetCookie(c))
      );
    } else {
      const single = upstream.headers.get("set-cookie");
      if (single) res.setHeader("set-cookie", rewriteSetCookie(single));
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length) res.setHeader("content-length", String(buf.length));
    res.end(buf);
  } catch (err) {
    console.error("api proxy failed", err?.message || err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: "API_PROXY_FAILED",
          message: "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע.",
        },
      })
    );
  }
}
