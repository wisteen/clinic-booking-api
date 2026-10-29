import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  client ??= neon(connectionString);
  return client;
}

export async function ensureSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const sql = getSql();
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        start TIMESTAMPTZ NOT NULL,
        "end" TIMESTAMPTZ NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL REFERENCES slots(id),
        active_slot_id TEXT UNIQUE REFERENCES slots(id),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
        created_at TIMESTAMPTZ NOT NULL
      )`,
      sql`CREATE INDEX IF NOT EXISTS bookings_email_created_idx
          ON bookings (email, created_at, id)`,
      sql`CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        response_status INTEGER NOT NULL,
        response_body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS rate_limits (
        email TEXT PRIMARY KEY,
        window_start BIGINT NOT NULL,
        attempts INTEGER NOT NULL
      )`,
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
