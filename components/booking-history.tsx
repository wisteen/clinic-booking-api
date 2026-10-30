"use client";

import { CalendarCheck2, Clock3, LoaderCircle, Search, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Slot = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
};

export type HistoryBooking = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: string;
};

type Props = {
  apiKey: string;
  slots: Slot[];
  defaultEmail?: string;
  onCancelled: (booking: HistoryBooking) => void | Promise<void>;
};

class ApiError extends Error {}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong");
  return body;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function BookingHistory({ apiKey, slots, defaultEmail = "", onCancelled }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [bookings, setBookings] = useState<HistoryBooking[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [error, setError] = useState("");

  const loadBookings = useCallback(async (patientEmail: string, cursor?: string) => {
    const normalized = patientEmail.trim().toLowerCase();
    if (!normalized) return;

    setLoading(true);
    setError("");
    try {
      const search = new URLSearchParams({ email: normalized, limit: "10" });
      if (cursor) search.set("cursor", cursor);
      const response = await fetch(`/bookings?${search}`, {
        headers: { "X-API-Key": apiKey },
        cache: "no-store",
      });
      const data = await readJson<{ bookings: HistoryBooking[]; next_cursor: string | null }>(response);
      setBookings((current) => cursor ? [...current, ...data.bookings] : data.bookings);
      setNextCursor(data.next_cursor);
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!defaultEmail) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadBookings(defaultEmail);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultEmail, loadBookings]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadBookings(email);
  }

  async function cancel(booking: HistoryBooking) {
    setCancellingId(booking.id);
    setError("");
    try {
      const response = await fetch(`/bookings/${encodeURIComponent(booking.id)}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      const cancelled = await readJson<HistoryBooking>(response);
      setBookings((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));
      await onCancelled(cancelled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel booking");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <section className="rounded-[28px] border border-[#d9e4dd] bg-white/85 p-5 shadow-[0_22px_60px_rgba(31,67,56,.08)] backdrop-blur sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e7f3ed] text-[#176b52]">
          <CalendarCheck2 size={19} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f897f]">Your appointments</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">My bookings</h2>
          <p className="mt-1 text-sm text-[#668078]">Enter the email used to book to view or cancel appointments.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="history-email">Booking email</label>
        <input
          id="history-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ada@example.com"
          className="min-w-0 flex-1 rounded-2xl border border-[#cddbd3] bg-[#fbfcfa] px-4 py-3 text-sm outline-none focus:border-[#49957e] focus:ring-4 focus:ring-[#8fc3b2]/20"
        />
        <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#163f35] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f5a47] disabled:opacity-60">
          {loading && !nextCursor ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
          View bookings
        </button>
      </form>

      {error && <p className="mt-4 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a44f32]">{error}</p>}

      {loaded && bookings.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-[#cfdcd5] px-5 py-10 text-center text-sm text-[#6b817a]">
          No bookings were found for this email.
        </div>
      )}

      {bookings.length > 0 && (
        <div className="mt-5 space-y-3">
          {bookings.map((item) => {
            const slot = slots.find((candidate) => candidate.id === item.slot_id);
            return (
              <article key={item.id} className="flex flex-col gap-4 rounded-[20px] border border-[#dce5df] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#264c41]">{slot?.provider ?? item.slot_id}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === "confirmed" ? "bg-[#e7f5ee] text-[#24775f]" : "bg-[#eceeed] text-[#707c76]"}`}>
                      {item.status === "confirmed" ? "Confirmed" : "Cancelled"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-[#647e75]">
                    <Clock3 size={14} /> {slot ? formatDate(slot.start) : `Created ${formatDate(item.created_at)}`}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-[#8a9d96]">{item.id}</p>
                </div>
                {item.status === "confirmed" && (
                  <button
                    type="button"
                    disabled={cancellingId === item.id}
                    onClick={() => void cancel(item)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#e4c9be] px-3.5 py-2.5 text-xs font-semibold text-[#a54e32] transition hover:bg-[#fff1eb] disabled:opacity-60"
                  >
                    {cancellingId === item.id ? <LoaderCircle size={14} className="animate-spin" /> : <X size={14} />}
                    Cancel booking
                  </button>
                )}
              </article>
            );
          })}

          {nextCursor && (
            <button type="button" disabled={loading} onClick={() => void loadBookings(email, nextCursor)} className="w-full rounded-2xl border border-[#d7e2dc] px-4 py-3 text-sm font-semibold text-[#416b5e] transition hover:bg-[#eef5f1] disabled:opacity-60">
              {loading ? "Loading…" : "Load more bookings"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
