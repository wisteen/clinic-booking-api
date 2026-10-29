import {
  type Booking,
  consumeRateLimit,
  decodeCursor,
  encodeCursor,
  errorResponse,
  getDatabase,
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  replayIdempotentResponse,
  requestHash,
  respondAndRemember,
  toBooking,
  unauthorizedResponse,
} from "../../lib/booking-api";

export const dynamic = "force-dynamic";

type NewBookingBody = { slot_id?: unknown; name?: unknown; email?: unknown };
type SlotRow = { id: string; start: string };

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
    const db = getDatabase();
    const hash = await requestHash(payload);

    if (idempotencyKey) {
      const replay = await replayIdempotentResponse(db, idempotencyKey, hash);
      if (replay) return replay;
    }

    const normalizedEmail = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (normalizedEmail) {
      const rateLimit = await consumeRateLimit(db, normalizedEmail);
      if (!rateLimit.allowed) {
        return errorResponse("too many booking attempts", 429, {
          "Retry-After": String(rateLimit.retryAfter),
        });
      }
    }

    const invalid = validationError(payload);
    if (invalid) {
      return respondAndRemember(db, idempotencyKey, hash, { error: invalid }, 400);
    }

    const slotId = payload.slot_id as string;
    const name = (payload.name as string).trim();
    const email = normalizedEmail;
    const slot = await db.prepare("SELECT id, start FROM slots WHERE id = ?").bind(slotId).first<SlotRow>();

    if (!slot) {
      return respondAndRemember(db, idempotencyKey, hash, { error: "slot not found" }, 404);
    }
    if (Date.parse(slot.start) <= Date.now()) {
      return respondAndRemember(db, idempotencyKey, hash, { error: "slot has already started" }, 400);
    }

    const booking: Booking = {
      id: `booking_${crypto.randomUUID()}`,
      slot_id: slotId,
      name,
      email,
      status: "confirmed",
      created_at: new Date().toISOString(),
    };
    const responseBody = JSON.stringify(booking);
    const statements = [
      db
        .prepare(
          `INSERT INTO bookings (id, slot_id, active_slot_id, name, email, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'confirmed', ?)`,
        )
        .bind(booking.id, booking.slot_id, booking.slot_id, booking.name, booking.email, booking.created_at),
    ];

    if (idempotencyKey) {
      statements.push(
        db
          .prepare(
            `INSERT INTO idempotency_keys
             (key, request_hash, response_status, response_body, created_at)
             VALUES (?, ?, 201, ?, ?)`,
          )
          .bind(idempotencyKey, hash, responseBody, booking.created_at),
      );
    }

    try {
      await db.batch(statements);
      return jsonResponse(booking, 201);
    } catch (error) {
      if (idempotencyKey) {
        const replay = await replayIdempotentResponse(db, idempotencyKey, hash);
        if (replay) return replay;
      }

      const confirmed = await db
        .prepare("SELECT id FROM bookings WHERE active_slot_id = ?")
        .bind(slotId)
        .first<{ id: string }>();
      if (confirmed) {
        return respondAndRemember(db, idempotencyKey, hash, { error: "slot already booked" }, 409);
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

    const db = getDatabase();
    const statement = cursor
      ? db
          .prepare(
            `SELECT id, slot_id, name, email, status, created_at
             FROM bookings
             WHERE email = ? AND (created_at > ? OR (created_at = ? AND id > ?))
             ORDER BY created_at ASC, id ASC
             LIMIT ?`,
          )
          .bind(email, cursor.created_at, cursor.created_at, cursor.id, limit + 1)
      : db
          .prepare(
            `SELECT id, slot_id, name, email, status, created_at
             FROM bookings
             WHERE email = ?
             ORDER BY created_at ASC, id ASC
             LIMIT ?`,
          )
          .bind(email, limit + 1);

    const result = await statement.all<Booking>();
    const hasMore = result.results.length > limit;
    const bookings = result.results.slice(0, limit).map(toBooking);
    const nextCursor = hasMore ? encodeCursor(bookings[bookings.length - 1]) : null;
    return jsonResponse({ bookings, next_cursor: nextCursor });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
