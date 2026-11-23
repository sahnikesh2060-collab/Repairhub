# Phase 1 Notes — Foundation, models and authentication

Status: **complete**. `npm test -w backend` passes 41 tests across `auth.test.js` (23) and
`models.test.js` (18). `npm run lint` and `npm run format:check` are clean.

## Files created

```
package.json  .gitignore  .editorconfig  .prettierrc  .prettierignore  eslint.config.js  README.md
docs/DECISIONS.md  docs/PHASE_1_NOTES.md
frontend/package.json  frontend/README.md
backend/package.json  backend/.env.example  backend/vitest.config.js
backend/uploads/.gitkeep  backend/src/seed/.gitkeep
backend/src/server.js  backend/src/app.js
backend/src/config/{env.js, db.js, constants.js}
backend/src/models/{User, TechnicianProfile, Booking, Category, Counter, Notification, Message}.js
backend/src/controllers/auth.controller.js
backend/src/services/{auth.service.js, token.service.js}
backend/src/routes/{index.js, auth.routes.js, health.routes.js}
backend/src/middleware/{authenticate, requireRole, validate, errorHandler, notFound, rateLimiters, upload}.js
backend/src/validators/{auth.schemas.js, common.schemas.js}
backend/src/sockets/index.js
backend/src/utils/{ApiError, asyncHandler, apiResponse, geo, bookingCode, logger}.js
backend/tests/{setup.js, auth.test.js, models.test.js}
```

## Reusable building blocks for later phases

| Need                | Use                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Throw an HTTP error | `throw new ApiError(status, code, message, details)` or `ApiError.notFound()` etc.        |
| Respond             | `sendSuccess(res, data, { status, meta })`                                                |
| Validate input      | `validate(z.object({ body, params, query }))`; parsed values replace `req.*`              |
| Auth / roles        | `authenticate` → `req.user = { id, role, name }`; `requireRole('admin', ...)`             |
| Coordinates         | `toPoint({ lng, lat })`, `fromPoint(point)`, `haversineKm(a, b)`, `isValidLngLat()`       |
| Common Zod fields   | `objectId, lng, lat, lngLat, email, password, phone, categoryKey, paginationQuery`        |
| Booking codes       | `await generateBookingCode()` → `REP-2026-1001`                                           |
| Status changes      | `Booking.pushStatus(booking, status, actor, note)` (only writer of `status`)              |
| Uploads             | `uploadImages('images')` middleware, then `toPublicPath(file)` for each `req.files` entry |
| Sockets             | `getIO()`, `userRoom(userId)` → `user:<id>`                                               |
| Constants / enums   | `config/constants.js` (`BOOKING_STATUS`, `SCHEDULE_STATUS`, `ERROR_CODES`, ...)           |

## Endpoints

All responses use the envelope `{ success: true, data, meta? }` or
`{ success: false, error: { code, message, details? } }`. Validation details look like
`{ field, in: 'body' | 'params' | 'query', message }`.

### GET /api/health

```json
// 200
{ "success": true, "data": { "status": "ok", "uptime": 42, "db": "up" } }
```

### POST /api/auth/register

Rate limited (20 / 15 min / IP). `role` is `customer` (default) or `technician`; `phone` is optional.

```json
// request
{ "name": "Sita Sharma", "email": "sita@example.com", "phone": "9800000001",
  "password": "secret123", "role": "customer" }
// 201  (+ Set-Cookie: rh_refresh=<jwt>; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=604800)
{ "success": true, "data": {
  "user": { "_id": "6740...", "name": "Sita Sharma", "email": "sita@example.com",
            "phone": "9800000001", "role": "customer", "isActive": true,
            "savedAddresses": [], "createdAt": "2026-11-22T18:00:00.000Z",
            "updatedAt": "2026-11-22T18:00:00.000Z" },
  "accessToken": "eyJhbGciOi..." } }
```

Errors: 422 `VALIDATION_ERROR` (bad fields, weak password, `role: "admin"`), 409 `DUPLICATE`
(`"email already exists"` / `"phone already exists"`). A technician also gets an empty
`TechnicianProfile` (unverified, offline, no location, `serviceRadiusKm` = `DEFAULT_SERVICE_RADIUS_KM`).

### POST /api/auth/login

```json
// request
{ "email": "sita@example.com", "password": "secret123" }
// 200 - same shape as register, user.lastLoginAt set, refresh cookie set
// 401
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }
```

### POST /api/auth/refresh

No body; sends the `rh_refresh` cookie (the browser does this automatically for `/api/auth/*`
when the request uses `credentials: 'include'`).

```json
// 200 (+ new rh_refresh cookie; the old one is now invalid)
{ "success": true, "data": { "user": { ... }, "accessToken": "eyJhbGciOi..." } }
// 401 - missing/invalid/expired cookie, or reuse detected (all sessions revoked); cookie cleared
{ "success": false, "error": { "code": "UNAUTHORIZED",
  "message": "Refresh token reuse detected; all sessions have been signed out" } }
```

### POST /api/auth/logout

```json
// 200 (+ Set-Cookie: rh_refresh=; Expires=Thu, 01 Jan 1970 ...)
{ "success": true, "data": { "loggedOut": true } }
```

### GET /api/auth/me (Bearer)

```json
// 200, customer
{ "success": true, "data": { "user": { ... } } }
// 200, technician
{ "success": true, "data": { "user": { ... }, "technicianProfile": {
  "_id": "...", "userId": "...", "categories": [], "bio": "", "experienceYears": 0,
  "visitFee": 0, "serviceRadiusKm": 10, "isAvailable": false, "isVerified": false,
  "ratingAvg": 0, "ratingCount": 0, "completedJobs": 0 } } }
```

Errors: 401 `UNAUTHORIZED` (no/invalid/expired token, user missing or `isActive: false`).

### PATCH /api/auth/me (Bearer)

Only `name`, `phone`, `avatar` (unknown keys → 422). `null` removes `phone` / `avatar`.
`avatar` must be an `http(s)://` URL or an `/uploads/...` path.

```json
// request
{ "name": "Sita K. Sharma", "avatar": "https://example.com/a.png", "phone": null }
// 200
{ "success": true, "data": { "user": { ... } } }
```

### Saved addresses (Bearer)

Body fields: `label` (1-40), `addressText` (3-300), `lng`, `lat` (numbers or numeric strings),
`isDefault` (boolean). Exactly one address is default once any exist. Max 10 addresses.

| Method | Path                              | Success                                                          |
| ------ | --------------------------------- | ---------------------------------------------------------------- |
| GET    | /api/auth/me/addresses            | 200 `{ addresses }`                                              |
| POST   | /api/auth/me/addresses            | 201 `{ address, addresses }`                                     |
| PATCH  | /api/auth/me/addresses/:addressId | 200 `{ address, addresses }` (partial; `lng` and `lat` together) |
| DELETE | /api/auth/me/addresses/:addressId | 200 `{ addresses }`                                              |

```json
// POST request
{ "label": "Home", "addressText": "Baluwatar, Kathmandu", "lng": 85.3313, "lat": 27.7286 }
// 201
{ "success": true, "data": {
  "address": { "_id": "6740...", "label": "Home", "addressText": "Baluwatar, Kathmandu",
               "location": { "type": "Point", "coordinates": [85.3313, 27.7286] },
               "isDefault": true, "createdAt": "...", "updatedAt": "..." },
  "addresses": [ ... ] } }
```

Errors: 422 `VALIDATION_ERROR` (out-of-range coordinates, bare `coordinates` array, bad id),
422 `ADDRESS_LIMIT_REACHED`, 404 `NOT_FOUND` (unknown address id).

### Global errors

| Status | Code                | When                                                               |
| ------ | ------------------- | ------------------------------------------------------------------ |
| 400    | `INVALID_JSON`      | malformed JSON body                                                |
| 400    | `INVALID_ID`        | Mongoose CastError                                                 |
| 401    | `UNAUTHORIZED`      | missing/invalid/expired JWT                                        |
| 403    | `FORBIDDEN`         | `requireRole` mismatch                                             |
| 404    | `NOT_FOUND`         | unknown route or resource                                          |
| 409    | `DUPLICATE`         | unique index violation, names the field                            |
| 413    | `PAYLOAD_TOO_LARGE` | JSON body over 1 MB                                                |
| 422    | `VALIDATION_ERROR`  | Zod or Mongoose validation, per-field `details`                    |
| 422    | `UPLOAD_*`          | `UPLOAD_INVALID_TYPE`, `UPLOAD_TOO_LARGE`, `UPLOAD_TOO_MANY_FILES` |
| 429    | `RATE_LIMITED`      | auth limiter (20/15 min) or general limiter (300/15 min)           |
| 500    | `INTERNAL_ERROR`    | anything else; `stack` included only in development                |

### Socket.io

Connect with `io(API_URL, { auth: { token: accessToken } })`. Valid tokens join `user:<userId>`;
otherwise `connect_error` with `err.data = { code: 'UNAUTHORIZED', message }`. No events yet.

## Decisions taken where the prompt was silent

- **`docs/PROJECT_SPEC.md` was not in the workspace.** Phase 1 was built from the Phase 1 prompt
  and `DECISIONS.md` alone. Add the spec to `docs/` if later phases should consult it.
- **Booking codes**: the counter stores how many codes were issued and the code is
  `1000 + seq`, so the first code is `REP-2026-1001` as required. A separate counter per UTC year.
- **Location sub-documents** store `addressText` inside the GeoJSON object
  (`{ type, coordinates, addressText }`). MongoDB's 2dsphere index accepts the extra field
  (covered by a test). Responses return locations as stored GeoJSON; use `fromPoint()` to read.
- **`TechnicianProfile.categories` "min 1 once onboarded"**: enforced when `isVerified` or
  `isAvailable` is true. Category keys are validated by shape (`/^[A-Z][A-Z_]{1,29}$/`), not a
  fixed enum, because the `Category` collection is the source of truth (Phase 2 checks existence).
- **Schedule history entries** also store `technicianId`, so history stays meaningful after a
  technician is declined or releases the job. `statusHistory.role` and `cancellation.role` also
  accept `system` for automatic transitions; `pushStatus` records `system` when `actor` is null.
- **Phone** is optional at registration, normalised by removing spaces, dashes and brackets
  (`+977 980-000-0002` → `+9779800000002`), and must be 7-15 digits.
- **Admin self-registration** is rejected by validation (422) before any DB work; the service
  also refuses it (403) as defence in depth.
- **Reuse detection** treats any correctly signed refresh token that is no longer stored
  (rotated, logged out or pruned as the 6th session) as reuse, and revokes all sessions.
- **Rate limiters are skipped when `NODE_ENV=test`**, because the suite sends many auth requests
  from one IP.
- **Helmet** uses `Cross-Origin-Resource-Policy: cross-origin` so the frontend (another origin)
  can display `/uploads` images.
- **Saved addresses**: the first address becomes the default; deleting the default promotes the
  first remaining one; max 10.
- **`tests/setup.js`** sets the test env vars itself and then imports app code dynamically,
  because ES module imports are hoisted above plain statements.
- **`socket.io-client`** is a backend dev dependency (used to verify the handshake; Phase 2's
  socket tests need it).
- **`.prettierignore`** was added (not in the tree) so Prettier skips `package-lock.json` and
  uploads.

No deviations from `DECISIONS.md`.

## Known gaps (by design, later phases)

- `npm run seed` only prints a message; the seed script arrives in Phase 2.
- `requireRole`, `upload.js` and `getIO()` are complete but not used by any Phase 1 route.
- No socket event handlers yet (Phase 2).
- In production, indexes are created by Mongoose `autoIndex`; `syncIndexes()` (which also drops
  stale indexes) only runs in development. Consider an explicit index step at deploy time.
- Graceful shutdown on Windows: `Ctrl+C` in a terminal sends SIGINT and is handled; killing the
  process from Task Manager is not catchable.

## Verify this phase

```bash
cd repairhub
npm install
npm test            # 41 passing
npm run lint
cp backend/.env.example backend/.env   # then set the two JWT secrets and MONGODB_URI
npm run dev
curl http://localhost:5000/api/health
```
