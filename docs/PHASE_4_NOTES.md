# Phase 4 Notes — Technician dashboard, admin panel, hardening, deployment, E2E

Status: **complete.** Final checks: `npm run lint` clean, `npm run format:check` clean,
`npm test` 80 backend tests passing, `npm run build` succeeds, `npm run test:e2e` (Playwright)
passing. Docker files are written and `docker compose config` validates, but the image was **not**
built here because Docker Desktop was not running.

## STEP 1 — Technician area (`/technician/*`)

Routes (lazy-loaded chunks): `/technician` (home), `/technician/jobs`, `/technician/jobs/:id`,
`/technician/earnings`, `/technician/profile`, all wrapped by `pages/technician/TechnicianArea.jsx`.

- **Onboarding gate**: without categories or a location the technician sees a 2-step setup (profile
  form, then base location via GPS / map / manual coordinates). Unverified technicians get a
  persistent "Pending admin verification. You won't receive jobs yet." banner.
- **Online presence** (`hooks/useOnlinePresence.js`): while online, watches GPS and PATCHes the
  location every 60 s or after moving more than 200 m; stops when offline and after the tab has been
  hidden for 5 minutes, resumes when visible.
- **Home**: Online/Offline switch reflecting the server's answer (going online asks for GPS once and
  PATCHes the location first; falls back to the saved location with a notice), stat tiles from
  `/me/earnings`, nearby requests (REST + live `new_repair_request`, newest first, "New" highlight,
  optional chime with a mute toggle), cards removed on `booking_taken` / `booking_cancelled`,
  optional map with the radius circle and approximate pins.
- **Accept / propose modal**: details and photos, the customer's preferred window, quick picks ("In 1
  hour", the next whole-hour slot today, "Tomorrow 10-11 AM"), custom date and time, auto slot label,
  note, fee defaulting to the visit fee; 409 `ALREADY_TAKEN` shows "Another technician took this job"
  and removes the card.
- **My jobs**: Awaiting customer / Upcoming / Active / Completed / Cancelled, server-side filtered and
  paginated.
- **Job detail**: shared tracker (technician wording), timeline and chat; customer name, tap-to-call
  phone and exact address with "Open in Google Maps" once confirmed; action bar only from
  `allowedActions`; while ON_THE_WAY `watchPosition` + `technician_location_update` every 15 s;
  cancelled bookings toast and return to My jobs.
- **Earnings** and **Profile** as specified.

## STEP 2 — Admin panel (`/admin/*`)

Overview (stat tiles, recharts bar and line charts), Technicians (pending queue with Approve / Reject,
filters, search, pagination), Users (role filter, search, activate / deactivate), Bookings (filters,
table, drawer with tracker, contacts, notified technicians with distance and response, timeline incl.
schedule history, read-only chat, admin cancel), Categories (add, edit, show/hide, reorder). All
lists use server-side pagination with loading, empty and error states.

## STEP 3 — Real-time polish

- The technician pin glides between positions (`SmoothMarker` in `MapView.jsx`, ease-out over 0.9 s,
  instant with reduced motion); the map only re-fits after a ~1 km change, so it does not jump.
- Customer booking lists update live; ETA updates with each location event.
- Technician toasts: "Sita accepted Tomorrow, 10:00 AM", "Sita asked for another time: …",
  "Sita chose another technician"; `booking_cancelled` toasts and leaves the job page.
- After any reconnect: booking rooms are rejoined (keyed on the connection id) and all active queries
  refetch. Handlers compare `updatedAt` (or `liveLocation.updatedAt`) and ignore stale events.

## STEP 4 — Hardening

Backend:

- Helmet CSP: `default-src 'self'`, scripts self only, styles self + inline (Leaflet/charts), images
  self/data/blob + `MAP_TILE_ORIGINS` (OpenStreetMap by default), `connect-src` self + ws/wss,
  `frame-ancestors 'none'`; `upgrade-insecure-requests` only when `COOKIE_SECURE=true`.
- CORS and Socket.io use the `CLIENT_URL` allow-list (comma-separated).
- `middleware/sanitize.js` strips keys starting with `$` or containing `.` from body, query and
  params (express-mongo-sanitize equivalent; that package cannot reassign `req.query`), plus `hpp`.
- Per-user limits: booking creation 10 / hour, chat messages 30 / minute, location 6 / minute (on top
  of auth 20 / 15 min and API 300 / 15 min per IP).
- `TRUST_PROXY=true` sets `trust proxy` (replaces the Phase 1 "production implies proxy" rule).
- Request id on every log line via `AsyncLocalStorage` (`[req:<id>]`), reused from a well-formed
  incoming `X-Request-Id` and echoed in the response; morgan access logs in every non-test mode.
- Production: Mongoose `autoIndex` off and no `syncIndexes` at boot; `npm run db:indexes` instead.
- Unhandled rejections / exceptions are logged, then the process shuts down cleanly with exit code 1.
- `tests/hardening.test.js` covers the request id, CSP, `$` stripping in body and query, hpp and CORS.

Frontend: technician and admin areas are `React.lazy` chunks (recharts lives only in the admin
overview chunk); the ErrorBoundary fallback wraps every page; images use `loading="lazy"`.

Serving: with `NODE_ENV=production` (or `SERVE_FRONTEND=true`) Express serves `frontend/dist` with
long-cached hashed assets and an SPA fallback (`no-cache`) for every path outside `/api`, `/uploads`
and `/socket.io`. Root `npm run build` then `npm start` runs everything on one port. Verified with a
production-mode smoke run: `/`, deep links, `/api/health`, API 404 envelope, CSP header.

## STEP 5 — Deployment

`Dockerfile` (multi-stage: dependencies → frontend build → slim runtime as the `node` user with a
health check), `docker-compose.yml` (app + `mongo:7` with `mongo-data` and `uploads` volumes; the app
syncs indexes before starting), `.dockerignore`, root `.env.example` for compose variables, and
[DEPLOYMENT.md](DEPLOYMENT.md) (production env table, Atlas notes, seeding once, Nginx with WebSocket
upgrade headers, operations checklist).

## STEP 6 — End-to-end testing

[E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md) (14-step two-browser walkthrough with what each browser
shows, DB state and socket events, plus negative checks) and `frontend/e2e/full-flow.spec.js`
(Playwright, two contexts with geolocation). The Playwright config starts an isolated stack
(`e2e/start-stack.mjs`: in-memory MongoDB + seed + backend on :5100, Vite on :5174) so it never
collides with `npm run dev` or touches a real database.

## Backend changes in this phase (additive)

1. Job-list filters `status=awaiting|upcoming|ongoing|completed|cancelled`.
2. `schedule_responded` carries `customerName`.
3. `nearby-requests` items carry `approxLocation` (2 decimals, about 1 km).
4. Hardening above; new env keys `TRUST_PROXY`, `SERVE_FRONTEND`, `MAP_TILE_ORIGINS`; `CLIENT_URL`
   accepts a comma-separated list (`env.CLIENT_URLS`).
5. `vite.config.js` reads `API_PROXY_TARGET` / `VITE_PORT` (defaults unchanged) for the E2E ports.

## Deviations and decisions

- **Reject** in the verification queue deactivates the account; there is no separate rejected state.
- The existing `Modal` gained `placement="right"` for the admin drawer (no parallel component).
- Socket token refresh uses an auth callback (see PHASE_3_NOTES) rather than forced reconnects.
- The compose app runs `syncIndexes` right before the server as an explicit deploy step; the Node
  server itself still never syncs indexes in production.
- `.jsx` files are not linted (the root ESLint config is hook-protected and only targets `.js`);
  Prettier formats everything.

## Known limitations

- Docker image build and `docker compose up` were not executed here (Docker Desktop not running).
- Socket.io is single-instance; scaling out needs the Redis adapter and sticky sessions.
- ETA is a straight-line estimate at 25 km/h, not a road route.
- Stale SEARCHING requests are not expired automatically; no scheduled reminders.
- Uploads are stored on local disk / a volume; no image resizing or virus scanning.
- The admin technicians / users / categories screens were exercised by building and code review, and
  the overview, bookings drawer data and verification flows by API tests; only the overview was
  clicked through in a browser.
- `MongoDB Atlas`: the database configured in `backend/.env` was seeded with demo accounts that share
  one password; reseed with `--reset` or remove them before real users sign up, and rotate the
  database password that was shared in chat.

## v2 ideas

- Online payments with eSewa or Khalti (deposit on confirmation, final payment on completion).
- Web push notifications (and mobile push via FCM) so technicians get requests with the tab closed.
- OTP phone login and phone verification.
- Technician KYC: citizenship / licence document upload and review in the admin queue.
- A dispute workflow (customer report, admin mediation, refunds).
- Route-based ETA (OSRM), request expiry and automatic re-broadcast with a widening radius.
- Redis adapter for multi-instance Socket.io; S3-compatible storage for photos.
