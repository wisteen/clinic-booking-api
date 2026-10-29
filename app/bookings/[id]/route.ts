import { ensureSchema, getSql } from "../../../db";
import {
  type BookingRow,
  errorResponse,
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  toBooking,
  unauthorizedResponse,
} from "../../../lib/booking-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const { id } = await context.params;
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, slot_id, name, email, status, created_at
      FROM bookings
      WHERE id = ${id}
    `;
    const booking = (rows as unknown as BookingRow[])[0];
    if (!booking) return errorResponse("booking not found", 404);
    return jsonResponse(toBooking(booking));
  } catch (error) {
    return internalErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const { id } = await context.params;
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      UPDATE bookings
      SET status = 'cancelled', active_slot_id = NULL
      WHERE id = ${id} AND status = 'confirmed'
      RETURNING id, slot_id, name, email, status, created_at
    `;
    const cancelled = (rows as unknown as BookingRow[])[0];

    if (cancelled) return jsonResponse(toBooking(cancelled));

    const existingRows = await sql`SELECT status FROM bookings WHERE id = ${id}`;
    if (!(existingRows as unknown as Array<{ status: string }>)[0]) {
      return errorResponse("booking not found", 404);
    }
    return errorResponse("booking is already cancelled", 409);
  } catch (error) {
    return internalErrorResponse(error);
  }
}
