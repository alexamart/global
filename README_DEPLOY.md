Deployment notes

Goal: Serve the static marketing site at `/` (from `globalgames/`) and the Vite-built admin app at `/admin` (from `frontend/dist`). The Express backend (`backend/`) serves both in production.

Preconditions
- Ensure environment variables are set (GMAIL_*, NEON_DATABASE_URL, etc.).
- Ensure `frontend/vite.config.js` has `base: '/admin/'` for production (already configured).
- Confirm `backend/app.js` serves admin static files when `NODE_ENV === 'production'` (already configured).

Local build
1. From repo root:

```bash
npm ci
npm run build
```

2. Inspect `frontend/dist` for admin build output and ensure `globalgames` contains your static site files.

Deploy options
- Single server (recommended for full control):
  - Build on CI (see .github/workflows/ci.yml) and copy `frontend/dist`, `backend/`, and `globalgames/` to server.
  - On server, install backend deps and run `NODE_ENV=production npm start` from `backend/` (or use a process manager like PM2).

- Platform-as-a-service (alternate):
  - If using Vercel/Netlify for the site and a separate host for backend, ensure the backend's `/admin` route is replaced by a redirect/proxy to the hosted admin app and that the root site is served correctly.

Notes & gotchas
- `frontend` build uses `base: '/admin/'` so assets expect to be served under `/admin/`.
- `backend` is already configured to serve `globalgames/` at `/` and the `frontend/dist` at `/admin` when `NODE_ENV=production`.
- CI builds `frontend/dist` and uploads it as an artifact; extend the workflow to deploy to your host (rsync, SCP, or provider-specific actions).

If you tell me your target host (Vercel, Railway, DigitalOcean droplet, etc.), I can add a deploy step and exact commands.
