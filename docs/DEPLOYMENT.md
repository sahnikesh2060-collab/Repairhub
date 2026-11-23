# Deploying RepairHub

In production one Node process serves everything on one port: the REST API (`/api`), Socket.io
(`/socket.io`), uploaded images (`/uploads`) and the built React app (every other path falls back
to `index.html`).

## 1. Build and start without Docker

```bash
npm ci
npm run build                     # builds frontend/dist
npm run db:indexes                # once per deploy: creates the 2dsphere and other indexes
npm start                         # backend with NODE_ENV from backend/.env (use production)
```

`backend/.env` for production (see the table below) must set `NODE_ENV=production`. With
`NODE_ENV=development` you can still serve the build by setting `SERVE_FRONTEND=true`.

## 2. Docker

```bash
cp .env.example .env              # put two different random secrets in it
docker compose up -d --build      # app on http://localhost:5000, MongoDB 7 with a named volume
docker compose logs -f app
```

- The image is multi-stage: it builds `frontend/dist`, then runs only the backend's production
  dependencies as the unprivileged `node` user, with a health check on `/api/health`.
- The compose `app` service runs `node src/scripts/syncIndexes.js` before starting the server, so
  indexes exist on every deploy. Uploads live in the `uploads` volume, data in `mongo-data`.
- To use Atlas instead of the bundled database, set `MONGODB_URI` in `.env` (the `mongo` service
  can then be removed).
- Seed demo data once (refused in production mode, so override it for this one command):
  `docker compose run --rm -e NODE_ENV=development app node src/seed/seed.js --reset`.
  Do not seed a database real users will use: every demo account shares one password.

## 3. Production environment variables

| Variable                          | Production value                | Notes                                                                      |
| --------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                        | `production`                    | Serves the frontend, hides stack traces, no index sync at boot             |
| `PORT`                            | `5000`                          | Behind Nginx, keep it private                                              |
| `MONGODB_URI`                     | Atlas or your server            | MongoDB 6+                                                                 |
| `CLIENT_URL`                      | `https://repairhub.example.com` | Exact public origin(s), comma-separated; used by CORS and Socket.io        |
| `JWT_ACCESS_SECRET`               | 48 random bytes, hex            | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET`              | a **different** 48-byte secret  | The app refuses to start if they match or are short                        |
| `COOKIE_SECURE`                   | `true`                          | Refresh cookie only over HTTPS; also turns on `upgrade-insecure-requests`  |
| `TRUST_PROXY`                     | `true` behind Nginx             | Real client IP for rate limits; `X-Forwarded-Proto` for secure cookies     |
| `SERVE_FRONTEND`                  | (not needed)                    | Production always serves `frontend/dist`                                   |
| `MAP_TILE_ORIGINS`                | default OSM                     | Add your tile server here if you change `VITE_MAP_TILE_URL` (CSP)          |
| `CURRENCY`, radius, upload limits | defaults                        | See `backend/.env.example`                                                 |

The frontend needs no runtime variables when it is served by the backend (it calls `/api` and
`/socket.io` on the same origin). `VITE_*` values are baked in at build time.

## 4. MongoDB Atlas

- Create a cluster (the free M0 tier works; `2dsphere` indexes and `$geoNear` are supported).
- Database Access: create a user with read/write on the `repairhub` database only.
- Network Access: allow your server's IP (avoid `0.0.0.0/0` in production).
- Connection string: `mongodb+srv://<user>:<password>@<cluster>/repairhub?retryWrites=true&w=majority`.
- Run `npm run db:indexes` (or the compose service does it) after the first deploy and after any
  schema change; without the 2dsphere indexes dispatch queries fail.
- Seed only demo or staging databases: `npm run seed -w backend -- --reset` drops every collection.

## 5. Nginx in front (TLS, WebSockets)

```nginx
server {
  listen 443 ssl http2;
  server_name repairhub.example.com;

  ssl_certificate     /etc/letsencrypt/live/repairhub.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/repairhub.example.com/privkey.pem;

  client_max_body_size 30m;          # 5 photos x 5 MB plus form fields

  # Socket.io needs the WebSocket upgrade headers.
  location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
    proxy_read_timeout 75s;
  }

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }
}

server {
  listen 80;
  server_name repairhub.example.com;
  return 301 https://$host$request_uri;
}
```

With this setup use `COOKIE_SECURE=true`, `TRUST_PROXY=true` and
`CLIENT_URL=https://repairhub.example.com`. Nginx's `$request_id` is reused as the app's request id,
so one id ties the Nginx access log to the app log lines.

## 6. Operations checklist

- Health: `GET /api/health` → `{ status: 'ok', uptime, db: 'up' }` (also the Docker health check).
- Logs: every line carries `[req:<id>]`; responses echo it in `X-Request-Id`.
- Rate limits: auth 20 / 15 min per IP, API 300 / 15 min per IP, booking creation 10 / hour per
  customer, chat 30 / minute per user, location 6 / minute per technician.
- Shutdown: SIGTERM / SIGINT close Socket.io, the HTTP server and MongoDB cleanly; unhandled errors
  are logged and the process exits with code 1 so the supervisor restarts it.
- Backups: back up the MongoDB database and the uploads directory / volume together.
- Socket.io runs in a single process. To run several app instances, add the Socket.io Redis
  adapter and sticky sessions first.
