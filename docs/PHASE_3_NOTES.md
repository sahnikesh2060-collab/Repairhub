# Phase 3 Notes — Frontend foundation and the customer experience

Status: **complete**. `npm run build -w frontend` succeeds, `npm run lint` is clean and
`npm test -w backend` still passes 75 tests. The customer flow was exercised end to end in a browser
against the seeded backend (technician actions sent through the API), see "Verified" below.

Stack as locked: Vite 6, React 18.3, React Router 6.30 (`createBrowserRouter`), **Tailwind CSS v4**
via `@tailwindcss/vite` (no v3 fallback needed), TanStack Query 5, react-hook-form + zod 3 +
`@hookform/resolvers`, axios, socket.io-client, react-hot-toast, lucide-react, date-fns 4, clsx,
leaflet 1.9 + react-leaflet 4 (React 18) with OpenStreetMap tiles.

## Routes

| Path                     | Access          | Page                                                            |
| ------------------------ | --------------- | --------------------------------------------------------------- |
| `/`                      | public          | Landing: hero, category tiles (`GET /categories`), how it works |
| `/login`                 | signed-out only | Login (`?next=` honoured, same-app paths only)                  |
| `/register`              | signed-out only | Register with customer / technician toggle (`?role=technician`) |
| `/customer`              | customer        | CustomerDashboard: greeting, category tiles, Active / Past tabs |
| `/customer/bookings/new` | customer        | NewBooking 3-step form (`?category=AC` preselects)              |
| `/customer/bookings/:id` | customer        | BookingDetail tracking screen                                   |
| `/customer/addresses`    | customer        | Saved addresses CRUD with LocationPicker                        |
| `/customer/profile`      | customer        | Name, phone, avatar URL                                         |
| `/technician/*`          | technician      | "Coming in Phase 4"                                             |
| `/admin/*`               | admin           | "Coming in Phase 4"                                             |
| `*`                      | any             | NotFound                                                        |

`ProtectedRoute` sends signed-out users to `/login?next=<path>`; `RoleRoute` sends other roles to their
own home (`/customer`, `/technician`, `/admin`); `PublicOnlyRoute` sends signed-in users home.

## Component map

```
src/main.jsx            QueryClient, RouterProvider, Toaster, Leaflet CSS
src/App.jsx             root route: AuthProvider > SocketProvider > NotificationProvider > Outlet
src/router.jsx          route table above
src/api/                client.js (axios, in-memory token store, 401 -> one refresh -> retry, envelope
                        unwrap, error normalisation, applyFieldErrors) + one module per resource
src/context/            AuthContext (silent refresh + /auth/me on load, login/register/logout/updateUser)
                        SocketContext (one connection while logged in, token via auth callback)
                        NotificationContext (bell data, notification:new, global toasts, tab title)
src/hooks/              useAuth, useSocket, useNotifications, useBookingRoom, useGeolocation, useNow
src/lib/                constants.js (statuses, colours, stages, actions), format.js (money, dates,
                        distance), queryKeys.js, bookingCache.js (socket -> cache helpers),
                        categoryIcons.jsx (lucide icon by category name)
components/ui/          Button Card Badge Field Input Textarea Select Modal ConfirmDialog Spinner
                        Skeleton EmptyState(+ErrorState) Avatar StarRating Tabs
components/layout/      AppShell (nav, bell, user menu, reconnecting banner, ErrorBoundary around pages)
                        NotificationBell ProtectedRoute RoleRoute PublicOnlyRoute ErrorBoundary(+RouteError)
components/booking/     StatusBadge BookingCard BookingTracker StatusTimeline ScheduleProposalCard
                        RequestNewTimeDialog TechnicianSummaryCard(+profile modal) ChatPanel ReviewForm
                        CancelBookingDialog LiveLocationMap PhotoUploader PhotoLightbox
components/map/         MapView (explicit Leaflet icon imports, customer + technician icons, fit bounds)
                        LocationPicker (click / drag marker, GPS, manual lat/lng fallback)
pages/                  Landing Login Register NotFound ComingSoon, customer/*
```

## Auth flow

1. On load `AuthContext` calls `POST /auth/refresh` (cookie) then `GET /auth/me` behind a full-screen
   loader. Failure simply means "signed out".
2. The access token is kept in a module variable (`tokenStore`), never in Web Storage.
3. A 401 from any API call (except login/register/refresh/logout) triggers **one** refresh; parallel
   401s wait for the same refresh promise, then retry. If the refresh fails, the session is cleared and
   the user is sent to `/login?next=<current path>`.
4. Errors reach the UI as `{ code, message, details, status }`; forms map `details[].field` onto
   react-hook-form fields with `applyFieldErrors`.

## Socket events → cache

One socket per signed-in user. The handshake uses `auth: (cb) => cb({ token: tokenStore.get() })`, so
every (re)connect sends the latest access token; an `UNAUTHORIZED` handshake triggers one refresh and a
reconnect. After a **re**connect all active queries are refetched. A slim "Reconnecting…" banner shows
while disconnected.

`useBookingRoom(id)` emits `join_booking_room` on mount and after every reconnect (keyed on
`connectionId`) and `leave_booking_room` on unmount, and handles only events whose `bookingId` matches.

| Event                                                                                                              | Handler             | Cache effect                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule_proposed`, `schedule_responded`, `booking_status_updated`, `booking_cancelled`                           | useBookingRoom      | `applyBookingSummary`: if `booking.updatedAt` is newer than the cached `['booking', id]`, patch status, scheduleStatus, proposedSchedule, stage, technician; then invalidate `['booking', id]` (to get allowedActions and histories) and `['bookings']` lists. Older or equal events are ignored (idempotent). |
| `booking_message`                                                                                                  | useBookingRoom      | append to `['messages', id]` (deduped by `_id`); clears the typing indicator                                                                                                                                                                                                                                   |
| `technician_location_updated`                                                                                      | useBookingRoom      | patch `liveLocation` in `['booking', id]` if its `updatedAt` is newer                                                                                                                                                                                                                                          |
| `typing`                                                                                                           | useBookingRoom      | local "<name> is typing…" state for 3 s                                                                                                                                                                                                                                                                        |
| `notification:new`                                                                                                 | NotificationContext | prepend to `['notifications']` (latest 10) and bump `unreadCount`; toast unless it is about the booking page being viewed (or a customer proposal, see next row)                                                                                                                                               |
| `schedule_proposed` (global)                                                                                       | NotificationContext | customer not on that booking page: toast with a "View proposal" action                                                                                                                                                                                                                                         |
| `schedule_proposed`, `schedule_responded`, `booking_status_updated`, `booking_cancelled`, `booking_taken` (global) | NotificationContext | invalidate `['bookings']` so dashboard cards update live                                                                                                                                                                                                                                                       |

The tab title shows the unread count, e.g. `(2) RepairHub`.

## Design system

- One primary colour (blue-600), slate greys, `rounded-xl` cards with subtle borders.
- Status colours are defined once in `lib/constants.js` (`STATUS`) and used by `StatusBadge`; badges
  always carry text.
- Skeletons for lists, loading state on every button, ConfirmDialog for destructive actions.
- Accessibility: labelled inputs with `aria-invalid`/`aria-describedby`, visible focus rings, real
  `<button>`s, dialogs trap focus, close on Esc and restore focus, tabs with arrow-key navigation,
  skip link, `prefers-reduced-motion` respected.
- Dates via date-fns in the browser's time zone; money via `Intl.NumberFormat` with `VITE_CURRENCY`.

## Backend changes (minimal, recorded as required)

1. **Chat read-only after COMPLETED.** The Phase 2 backend offered `CHAT` and accepted messages on
   COMPLETED bookings; Phase 3 requires read-only chat after COMPLETED or CANCELLED.
   `allowedActions` now omits `CHAT` for `FINISHED_STATUSES`, and `POST /bookings/:id/messages`
   answers 409 `CHAT_UNAVAILABLE` for finished bookings (`bookingStateMachine.js`,
   `message.service.js`; the booking test expectation was updated to `['REVIEW']`).
2. **No UTC text in schedule notifications.** Notification bodies contained a server-formatted
   "… UTC" time, which contradicts DECISIONS #13. They now carry only the technician's slot label
   (`Proposed arrival: Today 3:30-4:30 PM`); exact times are always rendered by the browser from
   `scheduledDate` (`booking.service.js`, example in `SOCKET_EVENTS.md` updated).

## Deviations and decisions

- **Socket token refresh**: instead of manually setting `socket.auth` and forcing a reconnect on every
  token refresh, the handshake reads the token through a callback. The server only checks the token at
  handshake time, so a live connection stays valid; dropping it on every refresh would lose events. A
  disconnected socket reconnects immediately when a new token arrives.
- **Category icons**: only a curated set of lucide icons is bundled (`lib/categoryIcons.jsx`, 25 names
  including all seeded ones); unknown names fall back to Wrench. Importing every lucide icon would add
  roughly 600 kB.
- **Optimistic schedule responses**: Accept / Request New Time / Choose Another Technician patch
  `status`, `scheduleStatus` and `stage` immediately (tracker moves at once) while the proposal card
  stays visible with its buttons disabled; any error rolls back and refetches.
- **Preferred window**: the form asks for one date plus from/to times; both times are required once
  any is given.
- **Lint**: the root ESLint config (protected by a hook) lints `.js` files only, so `.jsx` components
  are formatted by Prettier but not linted; Phase 4 can add a JSX/react-hooks config if the hook is
  relaxed.
- `.claude/launch.json` at the workspace root (outside `repairhub/`) only tells the Claude preview tool
  how to start Vite; it is not part of the app.

## Known gaps

- Technician and admin screens are placeholders (Phase 4).
- The technician pin jumps to new positions; smooth interpolation is Phase 4 ("real-time polish").
- The JS bundle is ~790 kB (245 kB gzip) in one chunk; route-level code splitting is Phase 4.
- Seeded proposal labels such as "Tomorrow 10 AM - 12 PM" are fixed strings while the seeded
  `scheduledDate` is relative to the seed time, so label and exact time can disagree in demo data.
- No automated frontend tests yet (Playwright arrives in Phase 4).

## Verified (browser, seeded data, technician steps via API)

Landing and categories; sign-in redirect to `/customer`; dashboard tabs and live card updates; the
open AC request (searching state, "Notified 3 technicians"); technician accept → proposal card appeared
live with tracker step 2, bell count and tab title; Request New Time dialog → waiting state;
re-proposal (round 2) and a chat message arrived live; Accept Time → confirmed card with technician
phone; ON_THE_WAY + location update → live map with ETA and "updated N s ago"; IN_PROGRESS → COMPLETED
→ chat read-only, review form → 5 stars; NewBooking 3 steps with default saved address and multipart
submit ("Request sent to 1 nearby technician"); "Search again" → 429 countdown; mobile 375 px (vertical
tracker, no horizontal scroll, notification panel); address edit + set default. Two bugs found and
fixed during this run: the NewBooking "Continue" button submitting the form on step 2 (React reused
the DOM button as the submit button mid-click; fixed with distinct `key`s) and the notification panel
overflowing on phones.

## Manual test script (customer side)

Prerequisites: backend `.env` configured, then

```bash
npm run seed -w backend -- --reset
npm run dev
```

Open http://localhost:5173 and sign in as **sita@repairhub.test / Password@123**. Import
`docs/RepairHub.postman_collection.json` and run "0. Setup" (stores `customerToken`, `techToken` for
Bikash, `adminToken`).

1. **Dashboard**: Active shows REP-…-1008 (AC, "Finding technician") and REP-…-1005 (Confirmed);
   Past shows the completed plumbing job with a review.
2. **New booking**: Book a repair → AC → title "AC not cooling, rattling noise", a description, one
   photo → Continue → the Home address is preselected (try "Use my current location" and dragging the
   pin) → Continue → Send request. Expect the toast "Request sent to N nearby technicians" and the
   tracker at step 1. Copy the booking id from the URL into the Postman `bookingId` variable.
3. **Search again** immediately → toast with the seconds remaining and a disabled button.
4. **Proposal (Postman as technician)**: run "2. … Accept and schedule". The page shows the proposal
   card live, the bell count rises and the tab title shows `(n) RepairHub`. From another page, the
   customer gets a "View proposal" toast instead.
5. **Request New Time** with "After 5 PM please" → "Waiting for Bikash Shrestha to propose a new time".
6. **Postman**: "3. … Technician proposes again (round 2)" → card shows "Proposal 2 of 3".
7. **Accept Time** → tracker step 3, confirmed card, technician phone visible.
8. **Chat**: send a message; Postman "4. … Chat: list" sees it; a technician message (POST
   `/bookings/{{bookingId}}/messages` with `techToken`) appears live.
9. **Postman**: "Mark on the way", then "Share location" → step 4, live map with both pins, ETA and a
   ticking "updated N s ago".
10. **Postman**: "Start repair", "Complete" (finalCost 1200) → step 6, final cost, chat read-only,
    review form → submit 5 stars → read-only review.
11. **Choose Another Technician**: on a new booking accepted by the technician, choose another
    technician → back to "Finding technician"; the declined technician can no longer open it (404).
12. **Cancel**: on a searching booking, Cancel booking → reason (5+ characters) → red banner with the
    reason and "by customer".
13. **Addresses**: add, edit (drag the pin), make default, delete; exactly one default remains.
14. **Profile**: change name and phone; the header updates immediately.
15. **Reconnect**: stop the backend for ~10 seconds → "Reconnecting…" banner → restart → banner
    disappears and the page catches up.
