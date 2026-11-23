# End-to-end testing guide

Two ways to test the whole product: the automated Playwright run, and a manual two-browser
walkthrough that also covers the negative cases.

## Automated (Playwright)

```bash
npx --prefix frontend playwright install chromium   # once
npm run test:e2e
```

`frontend/playwright.config.js` starts its own isolated stack on its own ports, so it never touches
your database or collides with `npm run dev`:

- `frontend/e2e/start-stack.mjs`: in-memory MongoDB, `seed --reset`, backend on **:5100**
- Vite dev server on **:5174**, proxying to :5100

`frontend/e2e/full-flow.spec.js` drives two browser contexts with geolocation granted (Sita at New
Baneshwor, Bikash at Koteshwor): create request → live notification → accept with a quick slot →
request new time with a note → technician sees the note and toast → re-propose 5:30 PM → accept →
both at step 3 with a Google Maps link → On The Way (map + ETA) → location change → Start Repair →
Complete with NPR 1,200 → 5-star review → the job appears in the technician's earnings. Failures keep
a trace and screenshots in `frontend/test-results` (`npx playwright show-trace <trace.zip>`).

## Manual walkthrough

### Setup

```bash
npm run seed -w backend -- --reset     # drops every collection first; demo databases only
npm run dev                            # API :5000, web :5173
```

- **Browser A** (normal window): http://localhost:5173, sign in as `sita@repairhub.test`.
- **Browser B** (incognito): sign in as `bikash@repairhub.test` (verified AC technician, Koteshwor,
  10 km radius). Make sure the switch says **Online**.
- Every password is `Password@123`. Geolocation needs `https` or `localhost`.
- Optional Browser C (another incognito or profile): `anil@repairhub.test` (also AC, Maharajgunj).

### Steps

| #   | Action                                                                                     | Browser A (customer) shows                                                                                           | Browser B (technician) shows                                                                                     | DB state (status / scheduleStatus)                                | Socket event                                                    |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | B sets **Online** (allow location)                                                         | –                                                                                                                    | Toast "You are online…"; stat tiles; nearby list                                                                 | profile `isAvailable: true`, `currentLocation` updated            | –                                                               |
| 2   | A: Book a repair → AC → "AC not cooling" + 1 photo → Home address (New Baneshwor) → Send   | Toast "Request sent to N nearby technicians"; tracker step 1 "Notified N technicians"                                | –                                                                                                                | `SEARCHING_TECHNICIAN` / `NONE`; `notifiedTechnicians` has Bikash | `new_repair_request`, `notification:new` → B                    |
| 3   | B waits ≤ 2 s, no refresh                                                                  | –                                                                                                                    | New card on top with **New**, "1.6 km away", photo count; chime if sound on                                      | unchanged                                                         | (received)                                                      |
| 4   | B: View & Accept → custom time today 3:30 PM, label "Today 3:30-4:30 PM", fee 800 → Accept | Proposal card live: "Today, 3:30 PM", "Proposal 1 of 3", fee NPR 800, technician card; tab title `(n) RepairHub`     | Job page at step 2 "Waiting for the customer"                                                                    | `SCHEDULE_PROPOSED` / `PENDING`, `technicianId` = Bikash          | `schedule_proposed` → A, `booking_taken` → other notified techs |
| 5   | A: **Request New Time**, note "After 5 PM please"                                          | "Waiting for Bikash Shrestha to propose a new time"                                                                  | Toast "Sita asked for another time: “After 5 PM please”"; violet card with the note; **Propose New Time** button | `SCHEDULE_PROPOSED` / `RESCHEDULE_REQUESTED`                      | `schedule_responded` → B                                        |
| 6   | B: Propose New Time → 5:30 PM                                                              | Card "Proposal 2 of 3"                                                                                               | "Your proposed time"                                                                                             | `SCHEDULE_PROPOSED` / `PENDING`, round 2                          | `schedule_proposed` → A                                         |
| 7   | A: **Accept Time**                                                                         | Tracker step 3; confirmed card with technician phone                                                                 | Toast "Sita accepted …"; step 3; customer phone, exact address, **Open in Google Maps**                          | `CONFIRMED_SCHEDULED` / `ACCEPTED`                                | `schedule_responded` → B                                        |
| 8   | B: **Mark On The Way**                                                                     | Step 4; map with your pin and the technician pin; "About N min away (estimate)"; "updated N s ago" ticking           | "Sharing your live location", last-sent time                                                                     | `ON_THE_WAY`; `liveLocation` set                                  | `booking_status_updated` → both                                 |
| 9   | B: Chrome DevTools → **Sensors** → change location (e.g. 27.6870, 85.3450)                 | Technician pin glides to the new spot within ~15 s; ETA updates                                                      | Last-sent time updates                                                                                           | `liveLocation` updated                                            | `technician_location_updated` → booking room                    |
| 10  | B: **Start Repair**                                                                        | Step 5 "In progress"; map disappears                                                                                 | Location sharing stops                                                                                           | `IN_PROGRESS`                                                     | `booking_status_updated`                                        |
| 11  | B: **Complete Job**, final cost 1200                                                       | Step 6; "Final cost NPR 1,200"; chat read-only; review form                                                          | "Waiting for the customer's review"                                                                              | `COMPLETED`, `finalCost: 1200`, `completedAt`                     | `booking_status_updated`, `notification:new` → A                |
| 12  | A: 5 stars + comment → Submit                                                              | "Your review" (read-only)                                                                                            | Notification "You received a 5-star review"                                                                      | `review` set; Bikash `ratingAvg` / `ratingCount` updated          | `notification:new` → B                                          |
| 13  | B: Earnings                                                                                | –                                                                                                                    | Today / month totals include NPR 1,200; job in the table; rating                                                 | –                                                                 | –                                                               |
| 14  | Admin (`admin@repairhub.test`): Bookings → open the booking                                | Drawer: tracker, notified technicians with distance and response, full timeline incl. both proposals, read-only chat | –                                                                                                                | –                                                                 | –                                                               |

### Negative checks

| Check                     | How                                                                                                                             | Expected                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Race                      | B and C both open the same new request; B accepts first, then C accepts                                                         | C sees "Another technician took this job"; the card disappears from C's list (`409 ALREADY_TAKEN`, `booking_taken`)                                                   |
| Not eligible              | Sign in as `pasang@` (unverified), `manoj@` (offline), `nabin@` (5 km radius, Kirtipur) while A creates a New Baneshwor request | None of them sees the request or gets a notification                                                                                                                  |
| Choose another technician | After step 4, A clicks **Choose Another Technician** and confirms                                                               | A: back to "Finding technician"; B: toast "Sita chose another technician", the job disappears from Nearby and its URL shows "Job not available"; Anil (C) is notified |
| Customer cancel           | A cancels before On The Way with a reason                                                                                       | Red banner with reason "by customer"; B gets a toast and is sent back to My jobs                                                                                      |
| No customer cancel later  | After step 8                                                                                                                    | A has no Cancel button (only admins can cancel ON_THE_WAY / IN_PROGRESS)                                                                                              |
| Refresh                   | Reload either browser at any step                                                                                               | Same step, same buttons (state comes from the server; the refresh cookie signs you in again)                                                                          |
| Reconnect                 | Stop the backend for 10 s (Ctrl+C), then start it again                                                                         | "Reconnecting…" banner, then it disappears and the page catches up (rooms are rejoined and queries refetched)                                                         |
| Rate limit                | Click **Search again** right after creating a request                                                                           | "You can search again in N seconds", button disabled with a countdown                                                                                                 |
