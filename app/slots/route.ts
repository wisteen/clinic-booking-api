import { ensureSchema, getSql } from "../../db";
import {
  errorResponse,
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

type SlotInput = {
  id?: unknown;
  provider?: unknown;
  start?: unknown;
  end?: unknown;
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  let payload: SlotInput;
  try {
    const parsed = JSON.parse(await request.text()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("request body must be a JSON object", 400);
    }
    payload = parsed as SlotInput;
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const provider = typeof payload.provider === "string" ? payload.provider.trim() : "";
  const startTime = typeof payload.start === "string" ? Date.parse(payload.start) : Number.NaN;
  const endTime = typeof payload.end === "string" ? Date.parse(payload.end) : Number.NaN;

  if (!id) return errorResponse("id is required", 400);
  if (!provider) return errorResponse("provider is required", 400);
  if (!Number.isFinite(startTime)) return errorResponse("start must be a valid date-time", 400);
  if (!Number.isFinite(endTime)) return errorResponse("end must be a valid date-time", 400);
  if (endTime <= startTime) return errorResponse("end must be later than start", 400);
  if (startTime <= Date.now()) return errorResponse("start must be in the future", 400);

  const start = new Date(startTime).toISOString();
  const end = new Date(endTime).toISOString();

  try {
    await ensureSchema();
    const sql = getSql();

    try {
      await sql`
        INSERT INTO slots (id, provider, start, "end")
        VALUES (${id}, ${provider}, ${start}, ${end})
      `;
    } catch (error) {
      const existing = await sql`SELECT id FROM slots WHERE id = ${id}`;
      if ((existing as unknown as Array<{ id: string }>)[0]) {
        return errorResponse("slot id already exists", 409);
      }
      throw error;
    }

    return jsonResponse({ id, provider, start, end, available: true }, 201);
  } catch (error) {
    return internalErrorResponse(error);
  }
}
