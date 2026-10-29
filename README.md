# MadeByKseniya

Mobile-first app for the MadeByKseniya nail studio: customers measure their nails with the phone camera against a
10 ₪ coin, book appointments and keep their sizes; the owner and managers run the studio from their phone.

- `client/` — React + Vite + Tailwind (Hebrew, RTL), installable as a home-screen app.
- `server/` — Express + PostgreSQL API (Node.js 22.5+).
- `docs/ARCHITECTURE.md` — app shell, design system, roles, camera flow, booking, security, tests, native path.

## Local setup

### 1. API
```
cd server
npm install
copy .env.example .env
npm run dev
```
Without `DATABASE_URL` the API runs an embedded Postgres (PGlite). Useful local `server/.env` settings:

```
# Prints every email (with its code) to the server log instead of sending it; the app says so on screen.
MAIL_PROVIDER=console
# If the project lives in OneDrive/Dropbox/iCloud, keep the dev database OUTSIDE the synced folder —
# sync locks its files ("Resource busy") and the embedded database stops opening.
PGLITE_DIR=C:/Users/<you>/AppData/Local/madebykseniya/pgdata
# Optional: make an existing account the site owner (users.id), once.
# OWNER_USER_ID=1
```

### 2. Client
```
cd client
npm install
npm run dev
```
Open `http://localhost:5173`. `/api/*` is proxied to the API on port 4000.

## Tests

```
cd server && npm test          # API, roles, security (in-memory Postgres; never reads .env)
cd client && npm test          # unit tests (Vitest)
cd client && npm run test:e2e  # Playwright on installed Edge; starts its own isolated API + Vite
```

## Deployment

The frontend and backend deploy separately; pushing to `main` deploys both.

### Frontend → Vercel
Root `vercel.json` builds `client/` (`client/dist`) and rewrites `/api/*` to `api/proxy.js`. Set in Vercel:
```
API_ORIGIN = https://<your-railway-domain>     (no trailing slash, no /api)
```
The browser keeps calling `/api/*` on the Vercel domain, so cookies stay first-party (required by iPhone Safari).

### API → Railway
`server/Dockerfile` (configured by `railway.json`), health check `/api/health`, next to a Railway PostgreSQL service.
Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `FRONTEND_URL=https://<vercel-domain>`,
`TRUST_PROXY=2`, plus the email provider (`MAIL_PROVIDER=microsoft` with `MICROSOFT_*` and `MAIL_FROM_*`, or
`resend` with `RESEND_*`) — see `server/.env.example` and `server/DEPLOY_AUTH.md`. Optional: `OPENAI_API_KEY` for
the concierge chat, `OWNER_USER_ID` to assign the owner once.

Migrations run automatically on start (forward-only, inside a transaction, never dropping data).

## Editing content

- Packages and prices: `client/src/lib/packageData.js` (cards and starting prices derive from it).
- Treatments, prices and durations for booking: database (`services` table, seeded by migration 002).
- Business hours: `server/src/appointmentsService.js` (`BUSINESS_HOURS`).
- Studio address (Waze): `client/src/lib/studioAddress.js`.
- Logo: `client/logo.jpeg` is the source; `python client/scripts/build-logo.py` regenerates `client/public/logo.png`.
