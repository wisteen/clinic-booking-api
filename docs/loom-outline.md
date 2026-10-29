# Loom walkthrough outline

Keep the recording below five minutes.

## 1. Show the deployed page (about 90 seconds)

Open the Vercel URL, enter the API key, filter the available slots, and create a booking. Point out the confirmation ID and then cancel the appointment so the slot becomes available again.

## 2. Show the API contract (about 60 seconds)

Open `app/reset/route.ts`, `app/slots/route.ts`, and `app/bookings/[id]/route.ts`. Briefly identify API-key authentication, validation, lookup, and cancellation.

## 3. Explain the reliability features (about 90 seconds)

Open `app/bookings/route.ts` and `db/index.ts`.

- The `active_slot_id` unique constraint prevents simultaneous double booking.
- The booking and idempotency response are written in one serializable Postgres transaction.
- Cursor pagination orders by `created_at` and `id`.
- Rate-limit updates use one atomic Postgres upsert.

## 4. Close with deployment and tests (about 30 seconds)

Show the Vercel deployment, the connected Neon database environment variable (hide its value), and the passing `npm run test:api` output. End on the GitHub repository page and mention that the production API key is stored as a Vercel secret.
