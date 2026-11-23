# Phase 2 Notes — Booking engine, dispatch, real-time, notifications, chat, seed

Status: **complete**. `npm test -w backend` passes **75 tests** in 6 files (Phase 1: 41; Phase 2:
dispatch 9, booking 15, sockets 6, admin/categories/notifications 4). `npm run lint` is clean.

- Socket events, rooms and payloads: **[SOCKET_EVENTS.md](SOCKET_EVENTS.md)**
- Postman collection: [RepairHub.postman_collection.json](RepairHub.postman_collection.json)
  (variables `{{baseUrl}}`, `{{customerToken}}`, `{{techToken}}`, `{{adminToken}}`, `{{bookingId}}`;
  login requests save tokens; one folder per flow step)
- `docs/PROJECT_SPEC.md` is still not in the repository; Phase 2 followed the Phase 2 prompt and
  `DECISIONS.md`.

## New files

```
backend/src/services/  bookingStateMachine.js  dispatch.service.js  booking.service.js
                       bookingPresenter.js  notification.service.js  realtime.service.js
                       message.service.js  technician.service.js  category.service.js  admin.service.js
backend/src/controllers/ booking  technician  admin  notification  category  (.controller.js)
backend/src/routes/      booking  technician  admin  notification  category  (.routes.js)
backend/src/validators/  booking  technician  admin  notification  (.schemas.js)
backend/src/sockets/booking.handlers.js
backend/src/utils/ids.js
backend/src/seed/seed.js
backend/tests/ helpers.js  dispatch.test.js  booking.test.js  sockets.test.js  admin.test.js
docs/ SOCKET_EVENTS.md  RepairHub.postman_collection.json  PHASE_2_NOTES.md
```

Changed Phase 1 files (additive only): `config/constants.js` (enums, error codes, socket event
names), `models/Booking.js` (+`lastBroadcastAt`, +`completedAt`), `routes/index.js` (mounts),
`sockets/index.js` (+`bookingRoom`, registers handlers), `middleware/upload.js`
(+`discardUploadedFiles`, +`discardUploadsOnError`), `backend/package.json` (`seed` script).

## State machine

`services/bookingStateMachine.js` holds the only transition table (exported as `TRANSITION_TABLE`).

| From                             | To                   | Who                                      |
| -------------------------------- | -------------------- | ---------------------------------------- |
| REQUESTED                        | SEARCHING_TECHNICIAN | system                                   |
| SEARCHING_TECHNICIAN             | SCHEDULE_PROPOSED    | technician (accept-and-schedule)         |
| SCHEDULE_PROPOSED                | SCHEDULE_PROPOSED    | assigned technician                      |
| SCHEDULE_PROPOSED                | CONFIRMED_SCHEDULED  | customer owner                           |
| SCHEDULE_PROPOSED                | SEARCHING_TECHNICIAN | customer owner or assigned technician    |
| CONFIRMED_SCHEDULED              | SCHEDULE_PROPOSED    | assigned technician                      |
| CONFIRMED_SCHEDULED              | SEARCHING_TECHNICIAN | assigned technician                      |
| CONFIRMED_SCHEDULED              | ON_THE_WAY           | assigned technician                      |
| ON_THE_WAY                       | IN_PROGRESS          | assigned technician                      |
| IN_PROGRESS                      | COMPLETED            | assigned technician (finalCost required) |
| REQUESTED .. CONFIRMED_SCHEDULED | CANCELLED            | customer owner or admin                  |
| ON_THE_WAY, IN_PROGRESS          | CANCELLED            | admin                                    |

Exports: `transition()` (in-memory doc), `planTransition()` (validates and returns the
statusHistory entry for atomic `findOneAndUpdate` writes), `assertTransition()`,
`canTransition()`, `allowedActions()`, `stageOf()`, `SYSTEM_ACTOR`.

`allowedActions` values: `ACCEPT_AND_SCHEDULE`, `ACCEPT_SCHEDULE`, `REQUEST_NEW_TIME`,
`DECLINE_TECHNICIAN`, `PROPOSE_SCHEDULE`, `RELEASE`, `MARK_ON_THE_WAY`, `START_REPAIR`,
`COMPLETE`, `CANCEL`, `REVIEW`, `REBROADCAST`, `CHAT`.

`stageOf` returns `{ stage, label, cancelled }`; CANCELLED reports the stage reached before it.

## Endpoints

All routes are under `/api`, use the Phase 1 envelope, and (except `/categories`) need
`Authorization: Bearer <accessToken>`. Every `:id` booking route answers **404** to anyone who is
not the customer owner, the assigned technician, an admin, or (read-only) a technician the open
request was sent to or whose own radius and categories cover it.

Common errors on every route: 401 `UNAUTHORIZED`, 403 `FORBIDDEN` (wrong role), 422
`VALIDATION_ERROR`, 404 `NOT_FOUND`. Booking writes may also answer 409 `BOOKING_CHANGED` when
the booking changed between read and write (reload and retry).

### Bookings

| Method | Path                              | Role                          | Body                                                                                                                                                                                          | Success                                                                                                                   | Extra error codes                                                     |
| ------ | --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| POST   | /bookings                         | customer                      | multipart or JSON: `category, title (5-120), description (10-2000), lng, lat, addressText, preferredFrom?, preferredTo?, preferredNote?, urgency?`, files `images` (≤5, jpeg/png/webp, ≤5 MB) | 201 `{ booking, matchedCount }`                                                                                           | 422 `INVALID_CATEGORY`, `UPLOAD_*`                                    |
| GET    | /bookings/my                      | customer                      | `?status=active\|past\|all&page&limit≤50`                                                                                                                                                     | 200 `{ bookings }`, meta `{ page, limit, total, totalPages }`                                                             |                                                                       |
| GET    | /bookings/technician/my           | technician                    | same query                                                                                                                                                                                    | 200 `{ bookings }` + meta                                                                                                 |                                                                       |
| GET    | /bookings/:id                     | any with access               | –                                                                                                                                                                                             | 200 `{ booking }` incl. `statusHistory, scheduleHistory, technician, customer?, area, stage, allowedActions, distanceKm?` |                                                                       |
| POST   | /bookings/:id/accept-and-schedule | technician                    | `scheduledDate (now+15m..now+14d), timeSlotLabel, technicianNote?, estimatedFee?`                                                                                                             | 200 `{ booking }`                                                                                                         | 409 `ALREADY_TAKEN`, 403 `NOT_ELIGIBLE`                               |
| POST   | /bookings/:id/propose-schedule    | assigned technician           | same                                                                                                                                                                                          | 200 `{ booking }`                                                                                                         | 409 `INVALID_TRANSITION`, `MAX_ROUNDS_REACHED`                        |
| POST   | /bookings/:id/respond-schedule    | customer owner                | `action: ACCEPT\|REQUEST_NEW_TIME\|DECLINE_TECHNICIAN, note?`                                                                                                                                 | 200 `{ booking, matchedCount? }`                                                                                          | 409 `INVALID_TRANSITION`, `MAX_ROUNDS_REACHED`                        |
| POST   | /bookings/:id/release             | assigned technician           | `reason (3-300)`                                                                                                                                                                              | 200 `{ bookingId, status, matchedCount }`                                                                                 | 409 `INVALID_TRANSITION`                                              |
| PATCH  | /bookings/:id/status              | assigned technician           | `status: ON_THE_WAY\|IN_PROGRESS\|COMPLETED, note?, finalCost (required for COMPLETED)`                                                                                                       | 200 `{ booking }`                                                                                                         | 409 `INVALID_TRANSITION`                                              |
| POST   | /bookings/:id/cancel              | owner / admin (state machine) | `reason (5-300)`                                                                                                                                                                              | 200 `{ booking }`                                                                                                         | 409 `INVALID_TRANSITION`, 403                                         |
| POST   | /bookings/:id/rebroadcast         | customer owner                | –                                                                                                                                                                                             | 200 `{ bookingId, matchedCount, notifiedCount }`                                                                          | 409 `NOT_SEARCHING`, 429 `RATE_LIMITED` (`details.retryAfterSeconds`) |
| POST   | /bookings/:id/review              | customer owner                | `rating (int 1-5), comment? (≤1000)`                                                                                                                                                          | 201 `{ booking }`                                                                                                         | 409 `NOT_COMPLETED`, `ALREADY_REVIEWED`                               |
| GET    | /bookings/:id/messages            | owner / assigned tech / admin | `?page&limit≤100`                                                                                                                                                                             | 200 `{ messages }` oldest first + meta                                                                                    | 409 `CHAT_UNAVAILABLE`                                                |
| POST   | /bookings/:id/messages            | owner / assigned tech         | `text (1-1000)`                                                                                                                                                                               | 201 `{ message }`                                                                                                         | 409 `CHAT_UNAVAILABLE`                                                |

### Technicians

| Method | Path                         | Role       | Body / query                                                                         | Success                                                                                                    | Errors                                         |
| ------ | ---------------------------- | ---------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| GET    | /technicians/me              | technician | –                                                                                    | 200 `{ profile, user, receivesJobs, message }`                                                             |                                                |
| PUT    | /technicians/me/profile      | technician | `categories[] (≥1, active), bio?, experienceYears, visitFee, serviceRadiusKm (1-50)` | 200 `{ profile, receivesJobs, message }`                                                                   | 422 `INVALID_CATEGORY`                         |
| PATCH  | /technicians/me/availability | technician | `isAvailable`                                                                        | 200 `{ profile, receivesJobs, message }`                                                                   | 422 `LOCATION_REQUIRED`, `CATEGORIES_REQUIRED` |
| PATCH  | /technicians/me/location     | technician | `lng, lat, addressText?`                                                             | 200 `{ ignored:false, currentLocation, lastLocationAt, liveBookings }` or `{ ignored:true, retryAfterMs }` |                                                |
| GET    | /technicians/nearby-requests | technician | –                                                                                    | 200 `{ requests }` (+ meta `{ count, radiusKm }`)                                                          | 422 `LOCATION_REQUIRED`                        |
| GET    | /technicians/me/earnings     | technician | `?tzOffsetMinutes` (Nepal = 345)                                                     | 200 `{ today, week, month, allTime: { total, count }, ratingAvg, ratingCount, recentJobs }`                |                                                |
| GET    | /technicians/:userId/public  | any        | –                                                                                    | 200 `{ technician }` with last 5 reviews                                                                   | 404                                            |

### Categories, notifications, admin

| Method | Path                              | Role   | Body / query                                                        | Success                                                                                                                               |
| ------ | --------------------------------- | ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /categories                       | public | –                                                                   | 200 `{ categories }` (active, by sortOrder)                                                                                           |
| GET    | /notifications                    | any    | `?unread=true&page&limit`                                           | 200 `{ notifications }`, meta incl. `unreadCount`                                                                                     |
| PATCH  | /notifications/:id/read           | owner  | –                                                                   | 200 `{ notification }` (404 for others)                                                                                               |
| PATCH  | /notifications/read-all           | any    | –                                                                   | 200 `{ updated }`                                                                                                                     |
| GET    | /admin/stats                      | admin  | –                                                                   | 200 `{ usersByRole, totalUsers, techniciansPendingVerification, bookingsByStatus, totalBookings, bookingsPerDay[7], completionRate }` |
| GET    | /admin/users                      | admin  | `?role&q&page&limit`                                                | 200 `{ users }` + meta                                                                                                                |
| PATCH  | /admin/users/:id/active           | admin  | `isActive`                                                          | 200 `{ user }` (422 for self-deactivation)                                                                                            |
| GET    | /admin/technicians                | admin  | `?verified&online&category&q&page&limit`                            | 200 `{ technicians }` (profile + `user`) + meta                                                                                       |
| PATCH  | /admin/technicians/:userId/verify | admin  | `isVerified`                                                        | 200 `{ profile }`; notifies `TECH_VERIFIED` (422 if no categories)                                                                    |
| GET    | /admin/bookings                   | admin  | `?status&category&q (bookingCode)&from&to&page&limit`               | 200 `{ bookings }` + meta                                                                                                             |
| GET    | /admin/bookings/:id               | admin  | –                                                                   | 200 `{ booking }` with populated `notifiedTechnicians`                                                                                |
| GET    | /admin/categories                 | admin  | –                                                                   | 200 `{ categories }` (all, incl. inactive)                                                                                            |
| POST   | /admin/categories                 | admin  | `key, name, icon?, description?, isActive?, sortOrder?`             | 201 `{ category }` (409 `DUPLICATE`)                                                                                                  |
| PATCH  | /admin/categories/:id             | admin  | `name?, icon?, description?, isActive?, sortOrder?` (key immutable) | 200 `{ category }`                                                                                                                    |

## Seed accounts (`npm run seed -w backend -- --reset`, password `Password@123`)

| Email                  | Role                             | Location (radius)   | Use it to test                                                                   |
| ---------------------- | -------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| admin@repairhub.test   | admin                            | –                   | stats, verify Pasang, users, bookings, categories                                |
| sita@repairhub.test    | customer                         | New Baneshwor       | open AC request (REP-…-1008), confirmed electrical job, completed + reviewed job |
| ram@repairhub.test     | customer                         | Patan               | PENDING proposal to answer; live ON_THE_WAY tracking; a cancelled booking        |
| gita@repairhub.test    | customer                         | Thamel              | RESCHEDULE_REQUESTED proposal; IN_PROGRESS repair                                |
| bikash@repairhub.test  | technician AC, APPLIANCE         | Koteshwor (10 km)   | ON_THE_WAY to Ram; receives Sita's AC request                                    |
| sunita@repairhub.test  | technician COMPUTER              | Shankhamul (8 km)   | PENDING proposal with Ram                                                        |
| rajesh@repairhub.test  | technician PLUMBING              | Kalanki (12 km)     | propose round 2 for Gita                                                         |
| anil@repairhub.test    | technician ELECTRICAL, AC        | Maharajgunj (10 km) | confirmed job with Sita; receives Sita's AC request                              |
| prakash@repairhub.test | technician CARPENTRY, PLUMBING   | Bhaktapur (15 km)   | far east of the valley                                                           |
| nabin@repairhub.test   | technician COMPUTER, ELECTRICAL  | Kirtipur (**5 km**) | edge: radius too small for New Baneshwor                                         |
| pasang@repairhub.test  | technician COMPUTER              | Boudha (10 km)      | edge: **unverified**                                                             |
| manoj@repairhub.test   | technician APPLIANCE, ELECTRICAL | Jawalakhel (10 km)  | edge: **offline**                                                                |
| sarita@repairhub.test  | technician PLUMBING, APPLIANCE   | Chabahil (10 km)    | completed job with 5-star review; earnings                                       |
| dipak@repairhub.test   | technician COMPUTER, AC          | Balaju (12 km)      | IN_PROGRESS job: complete it                                                     |

Bookings REP-<year>-1001..1008: COMPLETED (+review), CANCELLED, IN_PROGRESS, ON_THE_WAY (+liveLocation,
chat), CONFIRMED_SCHEDULED, SCHEDULE_PROPOSED/RESCHEDULE_REQUESTED, SCHEDULE_PROPOSED/PENDING,
SEARCHING_TECHNICIAN (really broadcast to Bikash, Anil and Dipak). Ratings and completedJobs are
recomputed from the seeded bookings. Without `--reset` the seed refuses to run twice; it always
refuses when `NODE_ENV=production`.

## Deviations and decisions where the prompt was silent

- **Wrong actor → 403, not 409.** A transition missing from the table is 409 `INVALID_TRANSITION`
  `{ from, to }`; a listed transition attempted by the wrong party is 403 `FORBIDDEN`; a missing
  requirement (finalCost) is 422. Role-restricted routes answer 403 via `requireRole` first
  (customer PATCH status, technician respond-schedule).
- **Optimistic concurrency.** Apart from the atomic accept (DECISIONS #7), booking writes filter
  on the status and `updatedAt` that were read; a concurrent change yields 409 `BOOKING_CHANGED`.
- **Contact reveal.** STEP 2 says the exact address is revealed "once a technician is assigned"
  but STEP 3.3 says "full address from CONFIRMED_SCHEDULED on". One rule is applied everywhere:
  exact address, coordinates and both phone numbers are shared from **CONFIRMED_SCHEDULED** on
  (`CONTACT_REVEALED_STATUSES`). Before that, technicians see the area (first part of
  `addressText`) and the distance.
- **`ACCEPT_AND_SCHEDULE`** was added to `allowedActions` so the technician UI can also render its
  accept button from the list.
- **ACCEPT / REQUEST_NEW_TIME need `scheduleStatus: PENDING`**; DECLINE_TECHNICIAN is allowed while
  the customer waits for a re-proposal too.
- **Rebroadcast cooldown** starts at the first broadcast (`lastBroadcastAt`), so a re-broadcast
  right after creating a booking answers 429 with `retryAfterSeconds`.
- **Location throttle** is stored in the database (`lastLocationAt` in the update filter), so it
  holds across server instances. Throttled writes answer 200 `{ ignored: true }`, not an error.
  `PATCH /bookings/:id/status ON_THE_WAY` seeds `liveLocation` from the technician's last position.
- **ETA** = `ceil(straightLineKm / 25 km/h × 60)`: a rough straight-line estimate, not a route.
- **Chat** shows only messages by the current customer and technician (a declined technician's
  messages are hidden from the next one); GET marks returned messages as read; admins read all.
- **Earnings** periods use `?tzOffsetMinutes` (minutes east of UTC; weeks start Monday).
- **`completionRate`** = completed ÷ (completed + cancelled).
- **`typing`** is used as the event name in both directions.
- Added `GET /admin/categories` (all categories incl. inactive) for the admin screen.
- Deactivating a user revokes their refresh tokens and takes a technician offline; withdrawing
  verification also takes the technician offline.
- **Lint**: a config-protection hook blocks edits to `eslint.config.js`, so `x == null` checks were
  replaced with `isNil()` from `utils/ids.js` to satisfy `eqeqeq`.

## Known gaps

- Per-route rate limits for booking creation, messages and location are not added yet (Phase 4).
- Two simultaneous broadcasts of the same booking could both notify a newly eligible technician
  (re-broadcast itself is cooldown-guarded).
- Stale `SEARCHING_TECHNICIAN` bookings are not expired automatically.
- A notification is created for every chat message.

## Verify this phase

```bash
cd repairhub
npm install
npm test                                  # 75 passing
npm run lint
npm run seed -w backend -- --reset        # needs MONGODB_URI in backend/.env
npm run dev                               # API on http://localhost:5000
# Import docs/RepairHub.postman_collection.json and run folders 0 -> 8 in order.
```
