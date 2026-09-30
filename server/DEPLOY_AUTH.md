# Production deployment notes — MadeByKseniya auth & database

## Architecture

- **Frontend** → Vercel (static Vite build + serverless `/api` proxy)
- **Backend** → Railway service `MadeByKseniya1` (Express, Dockerfile, auto-deploy from `main`)
- **Database** → Railway service `Postgres` (all users, sessions, avatars, measurements, appointments)

The browser always calls **same-origin** `/api/*` on the Vercel domain.
`vercel.json` rewrites `/api/*` to `api/proxy.js`, which proxies those requests to Railway so session cookies stay first-party
(required for login to persist on iPhone Safari).

## Auth mechanism

Server-side sessions, no JWT:

- Passwords: bcryptjs (12 rounds), only the hash is stored in `users.password_hash`.
- Login/register create a random 32-byte token; only its SHA-256 hash is stored in `user_sessions`.
- The raw token lives in the `mbk_session` cookie (`HttpOnly`, `Secure` in production, `SameSite=Lax`).
- "Remember me" → persistent cookie + session valid 30 days; otherwise a browser-session cookie, 12 hours server-side.

No signing secret is needed, so there is no `JWT_SECRET` / `SESSION_SECRET` variable.

## Database & migrations

- Connection: `process.env.DATABASE_URL` only (`server/src/db.js`, `pg` pool).
- Migrations: `server/src/migrations.js`, applied automatically on startup, recorded in `schema_migrations`,
  guarded by an advisory lock. Append new migrations; never edit shipped ones.
- If `DATABASE_URL` is missing or Postgres is unreachable, the API stays up, retries, and returns JSON 503.

## Railway → service `MadeByKseniya1` → Variables

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
FRONTEND_URL=https://made-by-kseniya1.vercel.app
TRUST_PROXY=2
```

Optional: `OPENAI_API_KEY`, `OPENAI_MODEL` (AI chat). `PORT` is provided by Railway automatically.
Only if the browser calls Railway directly via `VITE_API_URL`: `COOKIE_SAMESITE=none`.

Public URL: service → **Settings → Networking → Generate Domain** (gives `https://<name>.up.railway.app`).

## Vercel → Settings → Environment Variables (Production + Preview)

```
API_ORIGIN=https://<name>.up.railway.app
```

- No trailing slash, no `/api`.
- Leave `VITE_API_URL` unset.
- Redeploy after saving (Deployments → latest → Redeploy).

## Verify after deploy

```
curl -i https://<name>.up.railway.app/api/health
curl -i https://made-by-kseniya1.vercel.app/api/health
```

Both must return `{"ok":true,"database":"connected"}`. A 503 `{"ok":false,"database":"disconnected"}`
means the API runs but cannot reach Postgres; a 503 `API_UNCONFIGURED` from Vercel means `API_ORIGIN` is missing.
