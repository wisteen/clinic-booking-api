# Five-minute walkthrough outline

## 0:00–1:20 — The patient experience

1. Open the deployed page and enter the API key.
2. Filter the available slots by clinician.
3. Select a time, enter a name and email, and confirm the appointment.
4. Point out the confirmation reference and cancel the booking to show that the slot becomes available again.

## 1:20–2:00 — API contract

Show the route folders under `app/`: `/reset`, `/slots`, `/bookings`, and `/bookings/[id]`. Mention that every response is JSON and every endpoint checks `X-API-Key`.

## 2:00–3:15 — Data integrity

Open `db/schema.ts`. Explain that `active_slot_id` has a database unique index and becomes `NULL` on cancellation. That constraint, rather than an in-memory check, makes simultaneous double-booking impossible.

Open `app/bookings/route.ts`. Show that a booking and its idempotency response are written in one D1 batch, so a retried request gets the same ID and cannot create a duplicate.

## 3:15–4:15 — Levels 4 and 5

Show cursor encoding and pagination in `lib/booking-api.ts`, then the atomic rate-limit upsert. Mention that the limit is isolated by normalized email and failed attempts count.

## 4:15–5:00 — Verification and deployment

Run `npm run test:api` against the deployed URL. Point out the concurrent 12-request test, idempotency test, cancellation test, pagination test, and rate-limit test. End on the public GitHub repository and deployed page.
