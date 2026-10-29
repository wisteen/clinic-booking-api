import {
  getDatabase,
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  unauthorizedResponse,
} from "../../lib/booking-api";

export const dynamic = "force-dynamic";

type SlotRow = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: number;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const provider = new URL(request.url).searchParams.get("provider");
    const db = getDatabase();
    const statement = provider === null
      ? db.prepare(
          `SELECT s.id, s.provider, s.start, s.end,
                  CASE WHEN b.id IS NULL THEN 1 ELSE 0 END AS available
           FROM slots s
           LEFT JOIN bookings b ON b.active_slot_id = s.id
           ORDER BY s.start ASC, s.id ASC`,
        )
      : db
          .prepare(
            `SELECT s.id, s.provider, s.start, s.end,
                    CASE WHEN b.id IS NULL THEN 1 ELSE 0 END AS available
             FROM slots s
             LEFT JOIN bookings b ON b.active_slot_id = s.id
             WHERE s.provider = ?
             ORDER BY s.start ASC, s.id ASC`,
          )
          .bind(provider);

    const result = await statement.all<SlotRow>();
    return jsonResponse({
      slots: result.results.map((slot) => ({ ...slot, available: Boolean(slot.available) })),
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
