import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const slots = pgTable("slots", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id").notNull().references(() => slots.id),
    activeSlotId: text("active_slot_id").references(() => slots.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: text("status", { enum: ["confirmed", "cancelled"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("bookings_active_slot_unique").on(table.activeSlotId),
    index("bookings_email_created_idx").on(table.email, table.createdAt, table.id),
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  email: text("email").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  attempts: integer("attempts").notNull(),
});
