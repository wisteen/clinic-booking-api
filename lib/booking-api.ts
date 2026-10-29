import { getSql } from "../db";

export type BookingStatus = "confirmed" | "cancelled";

export type Booking = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: BookingStatus;
  created_at: string;
};

export type BookingRow = Omit<Booking, "created_at"> & {
  created_at: string | Date;
  active_slot_id?: string | null;
};

type StoredIdempotency = {
  request_hash: string;
  response_status: number;
  response_body: string;
};

export type SqlClient = ReturnType<typeof getSql>;

export function isAuthorized(request: Request): boolean {
  const configuredKey = process.env.API_KEY;
  const suppliedKey = request.headers.get("X-API-Key");
  return Boolean(configuredKey && suppliedKey === configuredKey);
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function errorResponse(error: string, status: number, headers?: HeadersInit) {
  return jsonResponse({ error }, status, headers);
}

export function unauthorizedResponse() {
  return errorResponse("unauthorized", 401);
}

export function internalErrorResponse(error: unknown) {
  console.error(error);
  return errorResponse("internal server error", 500);
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    slot_id: row.slot_id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: toIsoString(row.created_at),
  };
}

export function toIsoDate(value: string | Date): string {
  return toIsoString(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export async function requestHash(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function replayIdempotentResponse(
  sql: SqlClient,
  key: string,
  hash: string,
): Promise<Response | null> {
  const rows = await sql`
    SELECT request_hash, response_status, response_body
    FROM idempotency_keys
    WHERE key = ${key}
  `;
  const stored = (rows as unknown as StoredIdempotency[])[0];

  if (!stored) return null;
  if (stored.request_hash !== hash) {
    return errorResponse("Idempotency-Key was already used with a different request body", 422);
  }

  return new Response(stored.response_body, {
    status: stored.response_status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Idempotency-Replayed": "true",
    },
  });
}

export async function respondAndRemember(
  sql: SqlClient,
  key: string | null,
  hash: string,
  body: unknown,
  status: number,
): Promise<Response> {
  if (!key) return jsonResponse(body, status);

  const responseBody = JSON.stringify(body);
  try {
    await sql`
      INSERT INTO idempotency_keys
        (key, request_hash, response_status, response_body, created_at)
      VALUES
        (${key}, ${hash}, ${status}, ${responseBody}, ${new Date().toISOString()})
    `;
    return jsonResponse(body, status);
  } catch (error) {
    const replay = await replayIdempotentResponse(sql, key, hash);
    if (replay) return replay;
    throw error;
  }
}

export async function consumeRateLimit(
  sql: SqlClient,
  email: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  const expiredBefore = now - 60_000;
  const rows = await sql`
    INSERT INTO rate_limits (email, window_start, attempts)
    VALUES (${email}, ${now}, 1)
    ON CONFLICT(email) DO UPDATE SET
      attempts = CASE
        WHEN rate_limits.window_start <= ${expiredBefore} THEN 1
        ELSE rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start <= ${expiredBefore} THEN EXCLUDED.window_start
        ELSE rate_limits.window_start
      END
    RETURNING window_start, attempts
  `;
  const row = (rows as unknown as Array<{ window_start: string | number; attempts: number }>)[0];

  if (!row) throw new Error("Rate-limit update returned no row");
  const windowStart = Number(row.window_start);
  const retryAfter = Math.max(1, Math.ceil((windowStart + 60_000 - now) / 1000));
  return { allowed: row.attempts <= 5, retryAfter };
}

export function encodeCursor(booking: Pick<Booking, "created_at" | "id">): string {
  const payload = JSON.stringify({ created_at: booking.created_at, id: booking.id });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const padded = cursor.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") return null;
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}
