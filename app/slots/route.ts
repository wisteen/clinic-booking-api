import { ensureSchema, getSql } from "../../db";
import {
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  toIsoDate,
  unauthorizedResponse,
} from "../../lib/booking-api";

export const dynamic = "force-dynamic";

type SlotRow = {
  id: string;
  provider: string;
  start: string | Date;
  end: string | Date;
  available: boolean;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const provider = new URL(request.url).searchParams.get("provider");
    await ensureSchema();
    const sql = getSql();
    const rows = provider === null
      ? await sql`
          SELECT s.id, s.provider, s.start, s."end", b.id IS NULL AS available
          FROM slots s
          LEFT JOIN bookings b ON b.active_slot_id = s.id
          ORDER BY s.start ASC, s.id ASC
        `
      : await sql`
          SELECT s.id, s.provider, s.start, s."end", b.id IS NULL AS available
          FROM slots s
          LEFT JOIN bookings b ON b.active_slot_id = s.id
          WHERE s.provider = ${provider}
          ORDER BY s.start ASC, s.id ASC
        `;

    return jsonResponse({
      slots: (rows as unknown as SlotRow[]).map((slot) => ({
        ...slot,
        start: toIsoDate(slot.start),
        end: toIsoDate(slot.end),
        available: Boolean(slot.available),
      })),
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
