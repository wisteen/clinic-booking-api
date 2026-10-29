import {
  type Booking,
  errorResponse,
  getDatabase,
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
    const db = getDatabase();
    const booking = await db
      .prepare("SELECT id, slot_id, name, email, status, created_at FROM bookings WHERE id = ?")
      .bind(id)
      .first<Booking>();
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
    const db = getDatabase();
    const cancelled = await db
      .prepare(
        `UPDATE bookings
         SET status = 'cancelled', active_slot_id = NULL
         WHERE id = ? AND status = 'confirmed'
         RETURNING id, slot_id, name, email, status, created_at`,
      )
      .bind(id)
      .first<Booking>();

    if (cancelled) return jsonResponse(toBooking(cancelled));

    const existing = await db.prepare("SELECT status FROM bookings WHERE id = ?").bind(id).first<{ status: string }>();
    if (!existing) return errorResponse("booking not found", 404);
    return errorResponse("booking is already cancelled", 409);
  } catch (error) {
    return internalErrorResponse(error);
  }
}
