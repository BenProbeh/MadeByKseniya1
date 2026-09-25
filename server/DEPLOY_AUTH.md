# Production deployment notes — MadeByKseniya auth & avatars

## Architecture

- **Frontend** → Vercel (static Vite build + serverless `/api` proxy)
- **Backend** → Railway (Express + SQLite, long-running process)

The browser always calls **same-origin** `/api/*` on the Vercel domain.
`api/[[...path]].js` proxies those requests to Railway so session cookies stay first-party.

## Vercel environment variables (required for auth)

In the Vercel project → **Settings → Environment Variables** (Production + Preview):

```
API_ORIGIN=https://YOUR-SERVICE.up.railway.app
```

Rules:

- No trailing slash
- Do **not** append `/api` (paths like `/api/auth/register` are forwarded as-is)
- No secrets in this value — it is only the public API origin
- Redeploy the frontend after saving

Optional alternative (cross-origin, not preferred):

```
VITE_API_URL=https://YOUR-SERVICE.up.railway.app/api
```

If `VITE_API_URL` is set, the client talks to Railway directly (requires CORS + `SameSite=None` cookies). Prefer `API_ORIGIN` + the proxy.

## Railway / API environment

```
NODE_ENV=production
FRONTEND_URL=https://made-by-kseniya1.vercel.app
CORS_ORIGINS=https://made-by-kseniya1.vercel.app
COOKIE_SAMESITE=none
COOKIE_SECURE=true
```

Cross-origin cookies (only when using `VITE_API_URL` without the proxy) require `SameSite=None` and `Secure`.
With the Vercel proxy + `API_ORIGIN`, browser requests are same-site on Vercel; Railway still receives server-side proxy traffic.

## Avatar storage

Local uploads are stored under `server/uploads/avatars/`.

**Railway ephemeral disk does not persist files across redeploys.**
Before relying on production avatars, plug a durable backend into
`server/src/storage/avatarStorage.js` (S3, Cloudinary, Vercel Blob, etc.).

Do not commit secrets. Use env vars for cloud credentials when wired.

## Verify after deploy

```
curl -i https://made-by-kseniya1.vercel.app/api/health
```

Expect JSON `{ "ok": true }` from Railway via the proxy — never Vercel plain-text `NOT_FOUND`.
