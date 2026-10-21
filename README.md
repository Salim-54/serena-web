# RM Utility Portal (web)

Vite + React + TypeScript PWA for hotel maintenance requests and the
utilities console, running on the **RM Utility API**
([serena-backend](https://github.com/Salim-54/serena-backend), NestJS +
PostgreSQL). It is the API-based successor of the Supabase portal — same
screens, but every rule (permissions, workflow, record window, display
conversions, reports) is enforced and computed by the server.

## Setup

```sh
cp .env.example .env        # VITE_API_URL=https://<api-host>/api/v1
npm install                 # npm 10.9 fails with "edgesOut"? use: npx npm@11 install
npm run dev                 # http://localhost:5173
npm run build               # static files in dist/ (Vercel, Netlify, Cloudflare Pages…)
```

The API must list the portal's origin in its `CORS_ORIGINS`.

## How it talks to the API

| | |
|---|---|
| Client | `src/lib/api.ts` — JSON over `fetch`, `Authorization: Bearer`, errors as `ApiError { status, code, message, requestId }` |
| Sign-in | `POST /auth/login` (`client: "portal"`); the server returns the user's **permissions**, used by `src/lib/permissions.ts` to pick screens and buttons |
| Tokens | access token in memory only; single-use refresh token in `localStorage`; refreshed on 401, serialised across calls **and tabs** (Web Locks) so reuse detection never signs you out |
| Forced password change | `mustChangePassword` / `PASSWORD_CHANGE_REQUIRED` → change-password screen (`PATCH /auth/password`) |
| Live updates | polling every 30 s while visible (replaces Supabase Realtime) |
| Photos | compressed in the browser and uploaded to the API (`POST /uploads/photos`), which stores them on its machine and names them after the ticket (`MT-00012-resolved-…`). Photos are protected like other API data: fetched with the access token (`AuthImage`) and shown in an in-app viewer — no secret in links, access ends with the session. New tickets: photos wait on the device (IndexedDB) and upload right after creation |
| Reports | `GET /tickets/report.xlsx`, `GET /readings/export.xlsx` (built by the server) |

## Who sees what

Decided by the API (`permissions`), not the portal:

| Login | Screens |
|---|---|
| admin | Recording (no time limit), Difference, Analytics (edit + export), Maintenance (everything) |
| supervisor | Recording (12 h window), Difference, Maintenance (workflow statuses, technicians) |
| staff (maintenance) | Recording (12 h window), Difference, Maintenance (full management, no report export; tickets filed under Maintenance) |
| Administration department | Analytics (read-only, export), Maintenance (full management incl. export; tickets filed under Administration) |
| other departments | their own requests: raise, follow, approve / not fixed / cancel |

## Security

- Strict **Content-Security-Policy** `<meta>` in production builds (scripts
  from the site only; network and images only from the API), generated
  from `VITE_API_URL` — limits what an injected script could reach.
- `vercel.json` security headers (HSTS, `X-Frame-Options: DENY`,
  `nosniff`, referrer and permissions policies).
- No secrets in the bundle: only the API URL. Photos are stored by the API
  and loaded with the access token, never via secret links.
- Passwords are never stored; drafts never include them.
- Short-lived access tokens, rotating refresh tokens with server-side reuse
  detection, account lockout and password policy (all in the API).

## PWA

Installable (Install button / Add to Home Screen), offline banner, form
drafts survive reloads and camera-induced page reloads, new versions apply
automatically when nobody is typing. API calls are never cached by the
service worker.
