# Production deployment notes — MadeByKseniya auth & avatars

## Environment (Railway / API)

```
NODE_ENV=production
FRONTEND_URL=https://your-vercel-app.vercel.app
CORS_ORIGINS=https://your-vercel-app.vercel.app
COOKIE_SAMESITE=none
COOKIE_SECURE=true
```

Cross-origin cookies (Vercel frontend → Railway API) require `SameSite=None` and `Secure`.

## Avatar storage

Local uploads are stored under `server/uploads/avatars/`.

**Railway ephemeral disk does not persist files across redeploys.**
Before relying on production avatars, plug a durable backend into
`server/src/storage/avatarStorage.js` (S3, Cloudinary, Vercel Blob, etc.).

Do not commit secrets. Use env vars for cloud credentials when wired.
