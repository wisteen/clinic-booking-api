import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const apiKey = process.env.API_KEY ?? "local-dev-key";

function futureIso(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function makeSlot(id, provider, hoursFromNow) {
  return {
    id,
    provider,
    start: futureIso(hoursFromNow),
    end: futureIso(hoursFromNow + 0.5),
  };
}

const slots = [
  makeSlot("s1", "Dr Ade", 24),
  makeSlot("s2", "Dr Binta", 25),
  makeSlot("s3", "Dr Ade", 26),
  makeSlot("s4", "Dr Binta", 27),
  makeSlot("s5", "Dr Ade", 28),
  makeSlot("s6", "Dr Binta", 29),
];

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.auth !== false) headers.set("X-API-Key", apiKey);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function step(label) {
  process.stdout.write(`✓ ${label}\n`);
}

const unauthorized = await request("/slots", { auth: false });
assert.equal(unauthorized.response.status, 401);
assert.deepEqual(unauthorized.body, { error: "unauthorized" });
step("API-key authentication");

const reset = await request("/reset", { method: "POST", body: { slots } });
assert.equal(reset.response.status, 200);

const listed = await request("/slots");
assert.equal(listed.response.status, 200);
assert.deepEqual(listed.body.slots.map((slot) => slot.id), slots.map((slot) => slot.id));
assert.ok(listed.body.slots.every((slot) => slot.available === true));

const filtered = await request("/slots?provider=Dr%20Ade");
assert.ok(filtered.body.slots.every((slot) => slot.provider === "Dr Ade"));
step("slot reset, sorting, filtering, and availability");

const invalid = await request("/bookings", {
  method: "POST",
  body: { slot_id: "s1", name: "Ada", email: "not-an-email" },
});
assert.equal(invalid.response.status, 400);
step("booking validation");

const bookingBody = { slot_id: "s1", name: "  Ada Obi  ", email: "  ADA@EXAMPLE.COM " };
const idempotencyKey = crypto.randomUUID();
const first = await request("/bookings", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: bookingBody,
});
assert.equal(first.response.status, 201);
assert.equal(first.body.name, "Ada Obi");
assert.equal(first.body.email, "ada@example.com");
assert.equal(first.body.status, "confirmed");

const retry = await request("/bookings", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: bookingBody,
});
assert.equal(retry.response.status, 201);
assert.equal(retry.body.id, first.body.id);

const reused = await request("/bookings", {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: { ...bookingBody, name: "Another Person" },
});
assert.equal(reused.response.status, 422);
step("idempotent creation and key-reuse protection");

const lookup = await request(`/bookings/${encodeURIComponent(first.body.id)}`);
assert.equal(lookup.response.status, 200);
assert.equal(lookup.body.id, first.body.id);
step("booking lookup");

const simultaneous = await Promise.all(
  Array.from({ length: 12 }, (_, index) =>
    request("/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { slot_id: "s2", name: `Patient ${index}`, email: `race-${index}@example.com` },
    }),
  ),
);
assert.equal(simultaneous.filter(({ response }) => response.status === 201).length, 1);
assert.equal(simultaneous.filter(({ response }) => response.status === 409).length, 11);
step("atomic protection against double-booking");

const cancelled = await request(`/bookings/${encodeURIComponent(first.body.id)}`, { method: "DELETE" });
assert.equal(cancelled.response.status, 200);
assert.equal(cancelled.body.status, "cancelled");
const cancelledAgain = await request(`/bookings/${encodeURIComponent(first.body.id)}`, { method: "DELETE" });
assert.equal(cancelledAgain.response.status, 409);
const afterCancel = await request("/slots");
assert.equal(afterCancel.body.slots.find((slot) => slot.id === "s1").available, true);
step("cancellation and slot release");

for (const slotId of ["s3", "s4", "s5"]) {
  const created = await request("/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { slot_id: slotId, name: "Ada Obi", email: "ada@example.com" },
  });
  assert.equal(created.response.status, 201);
}
const pageOne = await request("/bookings?email=ADA%40EXAMPLE.COM&limit=2");
assert.equal(pageOne.response.status, 200);
assert.equal(pageOne.body.bookings.length, 2);
assert.ok(pageOne.body.next_cursor);
const pageTwo = await request(`/bookings?email=ada%40example.com&limit=2&cursor=${encodeURIComponent(pageOne.body.next_cursor)}`);
assert.equal(pageTwo.response.status, 200);
assert.equal(pageTwo.body.bookings.length, 2);
assert.equal(pageTwo.body.next_cursor, null);
const invalidLimit = await request("/bookings?email=ada%40example.com&limit=0");
assert.equal(invalidLimit.response.status, 400);
step("case-insensitive cursor pagination");

const limited = [];
for (let attempt = 0; attempt < 6; attempt += 1) {
  limited.push(
    await request("/bookings", {
      method: "POST",
      body: { slot_id: "does-not-exist", name: "Rate Test", email: "limit@example.com" },
    }),
  );
}
assert.ok(limited.slice(0, 5).every(({ response }) => response.status === 404));
assert.equal(limited[5].response.status, 429);
assert.match(limited[5].response.headers.get("Retry-After") ?? "", /^\d+$/);
step("per-email rate limiting, including failed attempts");

process.stdout.write("\nAll five assessment levels passed.\n");
