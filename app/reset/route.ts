import {
  errorResponse,
  getDatabase,
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

    const db = getDatabase();
    const statements = [
      db.prepare("DELETE FROM idempotency_keys"),
      db.prepare("DELETE FROM bookings"),
      db.prepare("DELETE FROM slots"),
      db.prepare("DELETE FROM rate_limits"),
      ...payload.slots.map((slot) =>
        db
          .prepare("INSERT INTO slots (id, provider, start, end) VALUES (?, ?, ?, ?)")
          .bind(slot.id, slot.provider, slot.start, slot.end),
      ),
    ];

    await db.batch(statements);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse("invalid JSON body", 400);
    return internalErrorResponse(error);
  }
}
