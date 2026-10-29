import { ensureSchema, getSql } from "../../db";
import {
  errorResponse,
  internalErrorResponse,
  isAuthorized,
  jsonResponse,
  unauthorizedResponse,
} from "../../lib/booking-api";

export const dynamic = "force-dynamic";

type SlotInput = { id: string; provider: string; start: string; end: string };

function validSlot(value: unknown): value is SlotInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const slot = value as Record<string, unknown>;
  return (
    typeof slot.id === "string" &&
    slot.id.length > 0 &&
    typeof slot.provider === "string" &&
    slot.provider.length > 0 &&
    typeof slot.start === "string" &&
    Number.isFinite(Date.parse(slot.start)) &&
    typeof slot.end === "string" &&
    Number.isFinite(Date.parse(slot.end)) &&
    Date.parse(slot.end) > Date.parse(slot.start)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorizedResponse();

  try {
    const payload = (await request.json()) as { slots?: unknown };
    if (!payload || !Array.isArray(payload.slots) || !payload.slots.every(validSlot)) {
      return errorResponse("slots must be an array of valid slots", 400);
    }

    const ids = new Set(payload.slots.map((slot) => slot.id));
    if (ids.size !== payload.slots.length) {
      return errorResponse("slot ids must be unique", 400);
    }

    await ensureSchema();
    const sql = getSql();
    await sql.transaction(
      [
        sql`DELETE FROM idempotency_keys`,
        sql`DELETE FROM bookings`,
        sql`DELETE FROM slots`,
        sql`DELETE FROM rate_limits`,
        ...payload.slots.map(
          (slot) => sql`
            INSERT INTO slots (id, provider, start, "end")
            VALUES (${slot.id}, ${slot.provider}, ${slot.start}, ${slot.end})
          `,
        ),
      ],
      { isolationLevel: "Serializable" },
    );
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse("invalid JSON body", 400);
    return internalErrorResponse(error);
  }
}
