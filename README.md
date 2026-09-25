# made by kseniya — Nail Studio Website

Full-stack site for the nail salon "made by kseniya": React + Tailwind frontend, Express + SQLite backend, an OpenAI-powered chat concierge, and a full booking calendar.

## Structure
- `server/` — Express API, SQLite database (Node's built-in `node:sqlite`, requires **Node.js 22.5+**), OpenAI chat agent with tool-calling.
- `client/` — Vite + React + Tailwind (RTL Hebrew UI).

## Setup

### 1. Server
```
cd server
npm install
copy .env.example .env
```
Edit `server/.env` and set:
```
OPENAI_API_KEY=sk-...your real key...
OPENAI_MODEL=gpt-4o-mini
PORT=4000
```
Then run:
```
npm run dev
```
The API starts on `http://localhost:4000`. A `salon.db` SQLite file is created automatically on first run with seeded placeholder services.

### 2. Client
In a second terminal:
```
cd client
npm install
npm run dev
```
Open the printed local URL (usually `http://localhost:5173`). API calls to `/api/*` are proxied to the server automatically in dev.

## What's included
- **Home / Services / Gallery / About / Booking** pages, fully Hebrew + RTL, dark true-black "OLED" theme with neon-violet accents.
- **Booking page**: full month calendar, live time-slot availability (respects business hours: Sun–Thu 09:00–19:00, Fri 09:00–14:00, Sat closed), booking form, and a "find my appointment" phone lookup to reschedule/cancel.
- **AI concierge chat widget** (bottom-left bubble on every page): answers service questions and, via OpenAI function-calling, can check availability, book, and reschedule appointments directly against the same database as the UI. Requires `OPENAI_API_KEY` — without it, the chat returns a clear "not configured" message instead of crashing.

## Editing placeholder content
- **Services, prices, durations**: `server/src/db.js` (the `services` seed array). Edit and delete `server/salon.db` to reseed, or add an admin UI later.
- **Business hours**: `server/src/appointmentsService.js` (`BUSINESS_HOURS`).
- **Gallery images**: `client/src/pages/Gallery.jsx` currently shows gradient placeholder tiles — swap in real photos when available.
- **About text / brand story**: `client/src/pages/About.jsx`.
- **Colors / theme**: `client/tailwind.config.js` (`violet` and `oled` color scales).

## Notes
- The chat has no persistent history (stateless per browser session) — that's intentional for v1.
- The SQLite file is the single source of truth for both the booking UI and the AI agent, so double-booking is prevented in both paths.

## Deployment

The frontend and backend deploy to **separate services** — they can't share one Vercel deployment.

### 1. Frontend → Vercel
This is a monorepo (no root `package.json`), so a root-level [`vercel.json`](vercel.json) tells Vercel to build from `client/` without needing any dashboard configuration:
```
cd client && npm install && npm run build   →  output: client/dist
```
It also includes a SPA rewrite so client-side routes (`/booking`, `/services`, ...) don't 404 on direct load/refresh. Just connect the GitHub repo in Vercel and deploy — no Root Directory setting needed.

### 2. Backend → Railway (or similar)
`server/` is a long-running Express process with a local SQLite file — it is **not** compatible with Vercel's serverless model. Deploy it to a host that supports persistent processes/disks, e.g. Railway:
1. Create a new Railway project from this repo, set the service's root directory to `server/`.
2. Set the `OPENAI_API_KEY` and `OPENAI_MODEL` environment variables (see `server/.env.example`).
3. Railway assigns a public URL, e.g. `https://madebykseniya-production.up.railway.app`.

### 3. Connect them

**Preferred (same-origin proxy):** in the Vercel project settings, add:

```
API_ORIGIN = https://<your-railway-domain>
```

(no trailing slash, no `/api` suffix). Redeploy. The browser keeps calling `/api/*` on the Vercel domain; `api/[[...path]].js` forwards to Railway.

**Alternative:** set build-time

```
VITE_API_URL = https://<your-railway-domain>/api
```

and configure CORS + `SameSite=None` cookies on Railway (see `server/DEPLOY_AUTH.md`).

Until `API_ORIGIN` (or `VITE_API_URL`) is set, auth/register will not reach the Express server.
# MadeByKseniya
# MadeByKseniya1
