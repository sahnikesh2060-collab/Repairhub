# RepairHub Frontend

React 18 + Vite 6 + Tailwind CSS v4 (via `@tailwindcss/vite`), React Router 6 (`createBrowserRouter`),
TanStack Query v5, react-hook-form + zod, Socket.io client, Leaflet + react-leaflet 4 with
OpenStreetMap tiles (no API key).

## Install

From the repository root (npm workspaces install everything):

```bash
npm install
```

## Environment

Copy `frontend/.env.example` to `frontend/.env` if you need to change anything. The defaults work for
local development:

| Variable                        | Default               | Meaning                                                              |
| ------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `VITE_API_URL`                  | `/api`                | REST base URL (keep `/api` in development so the Vite proxy is used) |
| `VITE_SOCKET_URL`               | `/`                   | Socket.io origin (`/` = same origin, proxied in development)         |
| `VITE_CURRENCY`                 | `NPR`                 | Currency for prices (must match the backend `CURRENCY`)              |
| `VITE_MAP_DEFAULT_LAT` / `_LNG` | `27.7172` / `85.3240` | Map centre (Kathmandu)                                               |
| `VITE_MAP_TILE_URL`             | OpenStreetMap         | Tile URL template                                                    |

## Run

```bash
npm run dev                 # from the root: backend (:5000) + frontend (:5173)
npm run dev -w frontend     # frontend only
```

Open http://localhost:5173. The Vite dev server proxies `/api`, `/uploads` and `/socket.io`
(WebSocket) to `http://localhost:5000`, so the httpOnly refresh cookie is same-origin. Always use the
5173 URL in development; calling the API on :5000 directly from the page would not send the cookie.

Seed demo data first (`npm run seed -w backend -- --reset`) and sign in as
`sita@repairhub.test` / `Password@123`.

## Build

```bash
npm run build -w frontend   # outputs frontend/dist
npm run preview -w frontend # serves the build on :4173 (proxy not included; use for static checks)
```

## Notes

- The access token lives only in memory (`src/api/client.js`); a page reload signs in silently with
  the refresh cookie. Nothing is stored in localStorage or sessionStorage.
- Action buttons on booking screens are rendered only from `booking.allowedActions`.
- Technician and admin areas are placeholders until Phase 4.
