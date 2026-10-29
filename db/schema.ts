import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const slots = sqliteTable("slots", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
});

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id").notNull().references(() => slots.id),
    activeSlotId: text("active_slot_id").references(() => slots.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: text("status", { enum: ["confirmed", "cancelled"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("bookings_active_slot_unique").on(table.activeSlotId),
    index("bookings_email_created_idx").on(table.email, table.createdAt, table.id),
  ],
);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  email: text("email").primaryKey(),
  windowStart: integer("window_start").notNull(),
  attempts: integer("attempts").notNull(),
});
