import { ensureSchema, getSql } from "../../db";
import {
  type Booking,
  type BookingRow,
  consumeRateLimit,
  decodeCursor,
  encodeCursor,
  errorResponse,
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  replayIdempotentResponse,
  requestHash,
  respondAndRemember,
  toBooking,
  toIsoDate,
  unauthorizedResponse,
} from "../../lib/booking-api";

export const dynamic = "force-dynamic";

type NewBookingBody = { slot_id?: unknown; name?: unknown; email?: unknown };
type SlotRow = { id: string; start: string | Date };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validationError(payload: NewBookingBody): string | null {
  if (typeof payload.slot_id !== "string" || payload.slot_id.trim().length === 0) {
    return "slot_id is required";
  }
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return "name is required";
  }
  if (typeof payload.email !== "string" || payload.email.trim().length === 0) {
    return "email is required";
  }
  if (!EMAIL_PATTERN.test(payload.email.trim())) {
    return "email is invalid";
  }
  return null;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || null;
  let payload: NewBookingBody;
  try {
    const parsed = JSON.parse(await request.text()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("request body must be a JSON object", 400);
    }
    payload = parsed as NewBookingBody;
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const hash = await requestHash(payload);

    if (idempotencyKey) {
      const replay = await replayIdempotentResponse(sql, idempotencyKey, hash);
      if (replay) return replay;
    }

    const normalizedEmail = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (normalizedEmail) {
      const rateLimit = await consumeRateLimit(sql, normalizedEmail);
      if (!rateLimit.allowed) {
        return errorResponse("too many booking attempts", 429, {
          "Retry-After": String(rateLimit.retryAfter),
        });
      }
    }

    const invalid = validationError(payload);
    if (invalid) {
      return respondAndRemember(sql, idempotencyKey, hash, { error: invalid }, 400);
    }

    const slotId = (payload.slot_id as string).trim();
    const name = (payload.name as string).trim();
    const email = normalizedEmail;
    const slotRows = await sql`SELECT id, start FROM slots WHERE id = ${slotId}`;
    const slot = (slotRows as unknown as SlotRow[])[0];

    if (!slot) {
      return respondAndRemember(sql, idempotencyKey, hash, { error: "slot not found" }, 404);
    }
    if (Date.parse(toIsoDate(slot.start)) <= Date.now()) {
      return respondAndRemember(sql, idempotencyKey, hash, { error: "slot has already started" }, 400);
    }

    const booking: Booking = {
      id: `booking_${crypto.randomUUID()}`,
      slot_id: slotId,
      name,
      email,
      status: "confirmed",
      created_at: new Date().toISOString(),
    };
    const queries = [
      sql`
        INSERT INTO bookings
          (id, slot_id, active_slot_id, name, email, status, created_at)
        VALUES
          (${booking.id}, ${booking.slot_id}, ${booking.slot_id}, ${booking.name}, ${booking.email}, 'confirmed', ${booking.created_at})
      `,
    ];

    if (idempotencyKey) {
      queries.push(sql`
        INSERT INTO idempotency_keys
          (key, request_hash, response_status, response_body, created_at)
        VALUES
          (${idempotencyKey}, ${hash}, 201, ${JSON.stringify(booking)}, ${booking.created_at})
      `);
    }

    try {
      await sql.transaction(queries, { isolationLevel: "Serializable" });
      return jsonResponse(booking, 201);
    } catch (error) {
      if (idempotencyKey) {
        const replay = await replayIdempotentResponse(sql, idempotencyKey, hash);
        if (replay) return replay;
      }

      const confirmedRows = await sql`
        SELECT id FROM bookings WHERE active_slot_id = ${slotId}
      `;
      if ((confirmedRows as unknown as Array<{ id: string }>)[0]) {
        return respondAndRemember(sql, idempotencyKey, hash, { error: "slot already booked" }, 409);
      }
      throw error;
    }
  } catch (error) {
    return internalErrorResponse(error);
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!email) return errorResponse("email is required", 400);

    const limitValue = url.searchParams.get("limit");
    const limit = limitValue === null ? 10 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return errorResponse("limit must be an integer from 1 to 50", 400);
    }

    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursorValue && !cursor) return errorResponse("cursor is invalid", 400);

    await ensureSchema();
    const sql = getSql();
    const rows = cursor
      ? await sql`
          SELECT id, slot_id, name, email, status, created_at
          FROM bookings
          WHERE email = ${email}
            AND (created_at > ${cursor.created_at} OR (created_at = ${cursor.created_at} AND id > ${cursor.id}))
          ORDER BY created_at ASC, id ASC
          LIMIT ${limit + 1}
        `
      : await sql`
          SELECT id, slot_id, name, email, status, created_at
          FROM bookings
          WHERE email = ${email}
          ORDER BY created_at ASC, id ASC
          LIMIT ${limit + 1}
        `;

    const bookingRows = rows as unknown as BookingRow[];
    const hasMore = bookingRows.length > limit;
    const bookings = bookingRows.slice(0, limit).map(toBooking);
    const nextCursor = hasMore ? encodeCursor(bookings[bookings.length - 1]) : null;
    return jsonResponse({ bookings, next_cursor: nextCursor });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
