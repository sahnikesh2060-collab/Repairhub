# RepairHub Socket.io events

Server: Socket.io 4 on the API origin (`/socket.io`). Implementation: `backend/src/sockets/index.js`
(handshake, rooms) and `backend/src/sockets/booking.handlers.js` (client events). All server emits
go through `services/realtime.service.js` → `getIO()`; controllers never emit.

## Connecting

```js
import { io } from 'socket.io-client';
const socket = io(API_ORIGIN, { auth: { token: accessToken } });
socket.on('connect_error', (err) => console.log(err.message, err.data)); // { code: 'UNAUTHORIZED', message }
```

- The handshake verifies the **access token** (`handshake.auth.token`) and loads the user (must be
  active). Every socket joins `user:<userId>` automatically.
- When the access token is refreshed, set `socket.auth = { token }` and reconnect.

## Rooms

| Room            | Who is in it                                                  | Joined by             |
| --------------- | ------------------------------------------------------------- | --------------------- |
| `user:<userId>` | every socket of that user                                     | handshake (automatic) |
| `booking:<id>`  | customer owner, assigned technician, admins who asked to join | `join_booking_room`   |

A declined or released technician is removed from `booking:<id>` by the server.

## Booking summary (in every booking payload)

```json
{
  "_id": "6741f0c2a1b2c3d4e5f60718",
  "bookingCode": "REP-2026-1008",
  "status": "SCHEDULE_PROPOSED",
  "scheduleStatus": "PENDING",
  "proposedSchedule": {
    "technicianId": "6741ef...",
    "scheduledDate": "2026-11-23T09:45:00.000Z",
    "timeSlotLabel": "Today 3:30-4:30 PM",
    "technicianNote": "Will bring a gas kit",
    "estimatedFee": 800,
    "proposedAt": "2026-11-23T07:40:00.000Z",
    "round": 1
  },
  "technician": {
    "_id": "6741ef...",
    "name": "Bikash Shrestha",
    "avatar": null,
    "ratingAvg": 4.8,
    "ratingCount": 12,
    "experienceYears": 8,
    "completedJobs": 40,
    "visitFee": 500
  },
  "stage": { "stage": 2, "label": "Technician proposed arrival time", "cancelled": false },
  "updatedAt": "2026-11-23T07:40:00.123Z"
}
```

Use `booking.updatedAt` to ignore stale events (apply only if newer than the cached booking).
`technician` is `null` while no technician is assigned.

## Client → server (all accept an ack callback)

| Event                        | Payload                    | Ack                                                                                                                                                                                            |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_user_room`             | `{}`                       | `{ ok: true, room: "user:<id>" }` (compatibility no-op)                                                                                                                                        |
| `join_booking_room`          | `{ bookingId }`            | `{ ok: true, room }` or `{ ok: false, error: "NOT_FOUND" }`                                                                                                                                    |
| `leave_booking_room`         | `{ bookingId }`            | `{ ok: true }`                                                                                                                                                                                 |
| `technician_location_update` | `{ bookingId?, lng, lat }` | `{ ok: true, ignored: false, currentLocation, liveBookings }`, or `{ ok: true, ignored: true, retryAfterMs }` (max 1 write / 10 s), or `{ ok: false, error: "FORBIDDEN" }` for non-technicians |
| `typing`                     | `{ bookingId }`            | `{ ok: true }` or `{ ok: false, error: "NOT_IN_ROOM" }`                                                                                                                                        |

Invalid payloads answer `{ ok: false, error: "VALIDATION_ERROR", details: [{ field, message }] }`.
`technician_location_update` calls the same service as `PATCH /api/technicians/me/location`.

## Server → client

| Event                         | Room(s)                                                                      | Fired when                                                                |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `new_repair_request`          | `user:<techId>` for each newly notified technician                           | booking created, re-broadcast, or back to searching after decline/release |
| `booking_taken`               | `user:<techId>` for every other notified technician                          | a technician wins accept-and-schedule                                     |
| `schedule_proposed`           | `user:<customerId>`, `booking:<id>`                                          | accept-and-schedule, propose-schedule                                     |
| `schedule_responded`          | `user:<techId>`, `booking:<id>`                                              | customer ACCEPT / REQUEST_NEW_TIME / DECLINE_TECHNICIAN                   |
| `booking_status_updated`      | `booking:<id>`, `user:<customerId>`, `user:<techId>`                         | ON_THE_WAY, IN_PROGRESS, COMPLETED; release (customer + room)             |
| `booking_cancelled`           | `booking:<id>`, `user:<customerId>`, `user:<techId>`, pending notified techs | cancel                                                                    |
| `booking_message`             | `booking:<id>`                                                               | new chat message                                                          |
| `technician_location_updated` | `booking:<id>`                                                               | technician location write while the booking is ON_THE_WAY                 |
| `typing`                      | `booking:<id>` except the sender                                             | client `typing`                                                           |
| `notification:new`            | `user:<userId>`                                                              | every saved Notification (`notify()`)                                     |

Socket.io delivers an event once per socket even when the socket is in several target rooms.

### Payload examples

`new_repair_request` (no exact address, no coordinates, no phone):

```json
{
  "bookingId": "6741f0c2a1b2c3d4e5f60718",
  "bookingCode": "REP-2026-1008",
  "category": "AC",
  "title": "AC not cooling, rattling noise",
  "area": "New Baneshwor",
  "distanceKm": 1.6,
  "urgency": "NORMAL",
  "imagesCount": 1,
  "createdAt": "2026-11-23T07:30:00.000Z",
  "booking": { "...": "booking summary, technician null" }
}
```

`booking_taken`

```json
{ "bookingId": "6741f0c2a1b2c3d4e5f60718", "booking": { "...": "summary" } }
```

`schedule_proposed`

```json
{
  "bookingId": "6741f0c2...",
  "booking": { "...": "summary" },
  "proposal": {
    "scheduledDate": "2026-11-23T09:45:00.000Z",
    "timeSlotLabel": "Today 3:30-4:30 PM",
    "round": 1,
    "...": ""
  }
}
```

`schedule_responded`

```json
{
  "bookingId": "6741f0c2...",
  "booking": { "...": "summary" },
  "action": "REQUEST_NEW_TIME",
  "note": "After 5 PM please"
}
```

`booking_status_updated`

```json
{ "bookingId": "6741f0c2...", "booking": { "...": "summary" }, "status": "ON_THE_WAY", "note": "" }
```

`booking_cancelled`

```json
{
  "bookingId": "6741f0c2...",
  "booking": { "...": "summary" },
  "reason": "Fixed it myself",
  "cancelledBy": "customer"
}
```

`booking_message`

```json
{
  "bookingId": "6741f0c2...",
  "booking": { "...": "summary" },
  "message": {
    "_id": "...",
    "bookingId": "6741f0c2...",
    "senderId": "...",
    "senderRole": "customer",
    "senderName": "Sita Sharma",
    "text": "The gate is next to the blue pharmacy.",
    "readBy": ["..."],
    "createdAt": "2026-11-23T08:01:00.000Z"
  }
}
```

`technician_location_updated` (ETA is a rough straight-line estimate at 25 km/h)

```json
{
  "bookingId": "6741f0c2...",
  "lng": 85.3455,
  "lat": 27.6852,
  "etaMinutes": 4,
  "updatedAt": "2026-11-23T08:05:10.000Z",
  "booking": { "...": "summary" }
}
```

`typing`

```json
{
  "bookingId": "6741f0c2...",
  "userId": "6741ef...",
  "name": "Bikash Shrestha",
  "role": "technician"
}
```

`notification:new`

```json
{
  "bookingId": "6741f0c2...",
  "booking": { "...": "summary or null" },
  "notification": {
    "_id": "...",
    "userId": "...",
    "type": "SCHEDULE_PROPOSED",
    "title": "Bikash Shrestha accepted your request",
    "body": "Proposed arrival: Today 3:30-4:30 PM",
    "bookingId": "6741f0c2...",
    "isRead": false,
    "createdAt": "..."
  }
}
```

Notification types: `NEW_REQUEST`, `SCHEDULE_PROPOSED`, `SCHEDULE_RESPONDED`, `STATUS_UPDATED`,
`BOOKING_CANCELLED`, `NEW_MESSAGE`, `REVIEW_RECEIVED`, `TECH_VERIFIED`.
