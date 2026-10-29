# Haven Clinic Booking API

A durable appointment-booking API and responsive patient web page built against the [Koya Clinic Booking API assessment](https://koyaacademy.com/assessment-api).

## What is implemented

- **Level 1:** reset/list slots, create bookings, and look up a booking.
- **Level 2:** `X-API-Key` authentication, JSON errors, field validation, email normalization, unknown-slot and past-slot handling.
- **Level 3:** database-enforced single booking per active slot plus cancellation and slot release.
- **Level 4:** atomic idempotency-key handling and case-insensitive cursor pagination.
- **Level 5:** atomic per-email rate limiting at five attempts per 60 seconds, including failed attempts.

The web page lets a patient enter the API key, browse and filter slots, book a time, see the confirmation, and cancel the appointment.

## API contract

All endpoints require this header:

```http
X-API-Key: your-key
```

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/reset` | Delete bookings and replace all slots |
| `GET` | `/slots?provider=Dr%20Ade` | List slots in start-time order |
| `POST` | `/bookings` | Create a booking; optionally accepts `Idempotency-Key` |
| `GET` | `/bookings/{id}` | Look up one booking |
| `DELETE` | `/bookings/{id}` | Cancel a confirmed booking |
| `GET` | `/bookings?email=...&limit=10&cursor=...` | Page through one email's bookings |

Every error has the shape `{ "error": "message" }`.

## Why concurrent bookings are safe

`bookings.active_slot_id` has a unique database index. A confirmed booking stores its slot ID there; cancellation sets it to `NULL`. If simultaneous requests target one slot, D1 can commit only one insert and the other requests become `409` responses. Successful booking and idempotency records are committed in the same atomic D1 batch.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_hesitant_excalibur.sql
npm start
```

Copy `.env.example` to `.dev.vars` and set `API_KEY`. The included ignored local file uses `local-dev-key`.

To run the contract test against the local server:

```bash
npm run test:api
```

To test a deployment:

```bash
BASE_URL=https://example.com API_KEY=your-key npm run test:api
```

## Architecture

- Vinext/React page and Next-compatible route handlers
- Cloudflare Worker runtime
- Cloudflare D1 SQLite database with Drizzle-generated migrations
- API key stored as a hosted secret, never bundled into the browser or committed

See [docs/loom-outline.md](docs/loom-outline.md) for a concise recording plan.
