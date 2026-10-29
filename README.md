# Haven Clinic Booking API

A persistent appointment-booking API and responsive patient web page built for the [Koya Clinic Booking API assessment](https://koyaacademy.com/assessment-api). The application is a standard Next.js deployment for Vercel backed by Neon Postgres.

## Live deployment

- Patient booking page and API base: [clinic-booking-api-ten.vercel.app](https://clinic-booking-api-ten.vercel.app)
- ReDoc API reference: [clinic-booking-api-ten.vercel.app/docs](https://clinic-booking-api-ten.vercel.app/docs)
- OpenAPI description: [clinic-booking-api-ten.vercel.app/openapi.json](https://clinic-booking-api-ten.vercel.app/openapi.json)

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

`bookings.active_slot_id` has a unique Postgres constraint. A confirmed booking stores its slot ID there; cancellation sets it to `NULL`. If simultaneous requests target one slot, Postgres commits only one insert and the other requests become `409` responses. A successful booking and its idempotency record are committed in one serializable transaction.

## Local development

Requirements: Node.js 22.13 or newer and a Postgres database.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```dotenv
API_KEY=replace-with-a-long-random-key
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

The API creates its four tables on the first authenticated database request. The matching Drizzle migration is also committed in `drizzle/` for inspection or manual migration workflows.

Run the contract suite against a local server:

```bash
npm run test:api
```

Test a deployment:

```bash
BASE_URL=https://your-project.vercel.app API_KEY=your-key npm run test:api
```

## Deploy to Vercel

1. Import this GitHub repository into Vercel as a Next.js project.
2. Add the Neon integration from the Vercel Marketplace and connect it to the project. Confirm it provides `DATABASE_URL`.
3. Add `API_KEY` to the Production, Preview, and Development environments.
4. Deploy. No custom build command or output directory is required.
5. Call `POST /reset` once with future appointment slots, then run `npm run test:api` against the deployment.

## Architecture

- Next.js App Router page and route handlers
- Vercel Functions for the API
- Neon serverless Postgres for durable data
- SQL unique constraints and serializable transactions for race safety
- API key stored only in environment variables and entered by the patient at runtime

See [docs/loom-outline.md](docs/loom-outline.md) for a concise recording plan.
