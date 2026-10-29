# MadeByKseniya — architecture

A mobile-first web app for a nail studio: customers measure their nails with the phone camera, book
appointments and keep their sizes; the owner and managers run the studio from their phone.

## Stack

| Part | Tech | Where it runs |
|---|---|---|
| Client | React 18, Vite, Tailwind 3, React Router 6, lucide-react icons | Vercel (`client/dist`) |
| API | Express 4, PostgreSQL (`pg`) | Railway (Docker, `server/Dockerfile`) |
| Dev / test database | PGlite (embedded Postgres) | in-process |
| Email | Microsoft Graph (Outlook) or Resend; `console` in local dev | Railway variables |

The browser calls same-origin `/api/*`; on Vercel `api/proxy.js` forwards to Railway so cookies stay first-party
(required by iPhone Safari).

## Client structure

```
client/src
  App.jsx                 routes (every screen lazy-loaded)
  components/shell/       AppShell, TopBar, TabBar — the app frame
  components/ui/          Sheet, TextField, PageHeader, EmptyState — primitives
  components/nail-sizing/ IntroStep, FingerSelectStep, CaptureStep, MarkingStage, SummaryStep
  components/auth/        AuthLayout, CodeStep (email codes)
  pages/                  one file per screen
  lib/                    api clients, navigation, formatting, nailSizing/*, theme/*
  index.css               design tokens + component classes (the design system)
```

### App shell and navigation

- Phones: minimal top bar (back button on nested screens, the title fades in after the large title scrolls away)
  and a 4-tab bottom bar. Desktop: the same destinations as top links, plus a footer.
- Customer tabs: **בית · מדידה · תורים · פרופיל**. Home shows the single next step (confirm an approved booking,
  your next visit, a pending request, measure, or book).
- Staff (owner/manager) get a separate area at `/admin` with its own tabs: **סקירה · תורים · לקוחות · עוד**,
  entered from the "ניהול" button; "לאפליקציה" returns to the customer app. Admin controls never appear on
  customer screens.
- The tab bar hides while the keyboard is open (`html[data-keyboard="open"]`) and in full-screen flows
  (`html[data-immersive="true"]`, the camera). Safe areas use `env(safe-area-inset-*)` tokens.
- Modals are bottom sheets on phones (`components/ui/Sheet.jsx`): focus trap, Escape, scroll lock, focus restore.

### Design system (`client/src/index.css`, `client/tailwind.config.js`)

- **Colour**: OLED black base, surfaces `oled-900/850/800`, hairline borders `--theme-border`, brand violet
  `#b026ff` (never themed). Status inks: emerald / amber / red.
- **Type**: Secular One for the brand voice (headings, buttons, tabs; Hebrew only), Heebo for body, inputs, numbers
  and data. Scale: `large-title / title / headline / body / sub / foot / cap`. `.tnum` for times, sizes, prices.
  Sekuya only for Latin brand words (package names).
- **Components**: `.card`, `.list-group` + `.list-row` (iOS inset lists), `.btn-primary|secondary|danger|text`,
  `.chip`, `.segmented`, `.input` + `.field-*`, `.notice-*`, `.skeleton`, `.spinner`, `.sticky-cta`.
- **Personal colour** ("צבע האפליקציה"): curated swatches or a free colour wheel. `lib/theme/palette.js` derives a
  full palette and enforces contrast (tested against 3000 random colours); the brand violet and buttons stay fixed.

## Roles and permissions

| Role (`users.role`) | Shown as | Can |
|---|---|---|
| `owner` (exactly one, DB-enforced) | בעלים | everything below + grant/remove manager, restore removed users, mail connection |
| `admin` | מנהלת | staff area: customers, appointments, notifications, content; remove customers |
| `customer` | לקוחה | own profile, measurements, bookings |

Every rule is enforced by the API (`requireAuth` / `requireAdmin` / `requireOwner`, re-checked inside
transactions); the UI only hides what a role can't do. The owner row is protected by a trigger (cannot be
deleted, demoted or soft-deleted). The first owner is assigned once from `OWNER_USER_ID` (Railway variable).

## Nail sizing (camera)

1. **Intro** — what's needed: a 10 ₪ coin (23 mm outer diameter, Bank of Israel), flat surface, good light.
2. **Fingers** — all ten selected by default; large toggles.
3. **Capture** (full screen, per finger) — live camera with guides: coin circle above, finger outline below.
   Shutter in the thumb zone, or a photo from the gallery (also the fallback when the camera is blocked).
4. **Mark the coin** — drag the circle onto the coin, resize with the edge knob or slider.
5. **Mark the nail** — drag two edge lines to the widest point; a loupe magnifies while dragging.
   `width_mm = nail_px / coin_px × 23` — independent of resolution and distance. Implausible widths per finger
   ask her to check the marks. A dark or blurry photo (photo check score < 50) suggests a retake.
6. **Summary** — sizes per hand; tap a finger to re-measure; save. Success shows only after the API stored it.

Camera lifecycle (`lib/nailSizing/useCamera.js`): opened from a tap (or automatically when permission is already
granted), stopped when leaving the capture step, on tab hide, page exit and unmount; a stream that arrives after
the camera was stopped is released immediately. Photos never leave the phone — only numbers are saved.
Progress lives in `sessionStorage` (numbers only).

## Booking

Customer: treatment → day (21-day strip, any date from the month sheet) → time (free / ממתין לאישור grey /
תפוס red) → details → sticky "שליחת בקשה לתור". Every request starts `pending`. The owner approves
(`manager_approved`, an email with a one-time "אישור ההזמנה" link goes out) or rejects; the customer confirms
(`confirmed`) from the email or the app, and can cancel her own request/booking before it starts.
Double booking is prevented in the database (advisory lock + exclusion constraint), not only in the UI.

## Security notes

- Sessions: random tokens stored hashed, `httpOnly` cookies, `secure` in production, `SameSite=Lax`.
- CSRF: state-changing `/api` requests with a foreign `Origin` are rejected (`ORIGIN_REJECTED`).
- Headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS in production; no `X-Powered-By`.
- Measurements, profile, avatar and bookings are scoped to the signed-in account.
- Changing a verified email needs the current password. Sign-up hashes before branching (no timing oracle).
- The concierge chat needs an account, is rate-limited, and only accepts plain user/assistant text.

## Tests

| Suite | Command | What |
|---|---|---|
| API (node:test, in-memory Postgres) | `cd server && npm test` | auth, email codes, appointments, roles, admin, mail, security |
| Client unit (Vitest) | `cd client && npm test` | theme palette, camera lifecycle, measurement math, session, next step |
| End-to-end (Playwright, Edge) | `cd client && npm run test:e2e` | customer journey, owner approval, roles, camera on/off/retake/denied |

Tests never read `server/.env` and refuse to run against `DATABASE_URL`. The E2E suite starts its own API
(`server/scripts/e2e-server.mjs`, in-memory database and outbox) on port 4100 and Vite on 5180.

## Native app path

The current React web app is the right base: it is installable today (manifest + icons, standalone, safe areas).
For the App Store the recommended route is **Capacitor** around this same build — no rewrite. Native plugins worth
adding when needed: Camera (photo capture), Push Notifications (booking updates), Preferences/Secure Storage,
App Links (the "אישור ההזמנה" email link), Haptics (shutter). A React Native rewrite isn't justified: the product is
forms, lists and one camera flow, all of which already work well in a WebView.
