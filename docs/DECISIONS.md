# RepairHub — Architecture Decisions

These decisions are binding for every phase. Where `docs/PROJECT_SPEC.md` conflicts with this file, this file wins.

1. Booking status enum: REQUESTED, SEARCHING_TECHNICIAN, SCHEDULE_PROPOSED, CONFIRMED_SCHEDULED, ON_THE_WAY, IN_PROGRESS, COMPLETED, CANCELLED. (The original schema forgot SEARCHING_TECHNICIAN.)
2. scheduleStatus enum: NONE, PENDING, ACCEPTED, RESCHEDULE_REQUESTED, REJECTED.
3. Booking.technicianId references User, not TechnicianProfile. The profile is found by TechnicianProfile.userId.
4. Coordinates are ALWAYS GeoJSON [longitude, latitude]. Every API that accepts a location takes named fields { lng, lat } and converts them. Never accept a bare coordinate array from a client.
5. Customer schedule responses: ACCEPT; REQUEST_NEW_TIME (same technician re-proposes, max MAX_PROPOSAL_ROUNDS = 3); DECLINE_TECHNICIAN (technician removed and excluded, booking returns to SEARCHING_TECHNICIAN, re-broadcast).
6. A technician may RELEASE a job any time before ON_THE_WAY. It returns to SEARCHING_TECHNICIAN, they are excluded, and it is re-broadcast.
7. First accept wins, enforced by one atomic findOneAndUpdate. The loser gets HTTP 409 ALREADY_TAKEN.
8. Matching respects each technician's own serviceRadiusKm, capped by MAX_DISPATCH_RADIUS_KM.
9. Auth: access token (JWT, 15 min) returned in the JSON body and sent as Authorization: Bearer, kept in memory on the client. Refresh token (JWT, 7 days) in an httpOnly, SameSite=Lax cookie with path /api/auth, rotated on every refresh; only its SHA-256 hash is stored. Socket.io authenticates with the access token in handshake.auth.token.
10. Categories live in a Category collection. Bookings and profiles store the category key: AC, COMPUTER, PLUMBING, ELECTRICAL, APPLIANCE, CARPENTRY.
11. Money: Numbers in whole currency units; currency code from the CURRENCY env var (default NPR).
12. One response envelope everywhere. Success: { success: true, data, meta? }. Error: { success: false, error: { code, message, details? } }.
13. Timestamps are stored in UTC; the frontend shows them in the browser's time zone.
14. Seed data uses the Kathmandu Valley (center 27.7172, 85.3240).
15. Non-owners get 404, not 403, on booking routes, so IDs don't leak.
