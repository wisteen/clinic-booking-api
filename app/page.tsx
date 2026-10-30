"use client";

import {
  ArrowRight,
  CalendarPlus2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookingHistory } from "../components/booking-history";

type Slot = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
};

type Booking = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong", response.status);
  return body;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [provider, setProvider] = useState("All clinicians");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadSlots = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/slots", {
        headers: { "X-API-Key": key },
        cache: "no-store",
      });
      const data = await readJson<{ slots: Slot[] }>(response);
      setSlots(data.slots);
      setSelectedId((current) => {
        if (data.slots.some((slot) => slot.id === current)) return current;
        return data.slots.find((slot) => slot.available)?.id ?? "";
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        sessionStorage.removeItem("clinic-api-key");
        setApiKey("");
        setError("That API key was not accepted. Check it and try again.");
      } else {
        setError(reason instanceof Error ? reason.message : "Could not load appointment slots");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("clinic-api-key") ?? "";
    if (!saved) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setApiKey(saved);
      setKeyDraft(saved);
      void loadSlots(saved);
    });

    return () => {
      cancelled = true;
    };
  }, [loadSlots]);

  const providers = useMemo(
    () => ["All clinicians", ...Array.from(new Set(slots.map((slot) => slot.provider)))],
    [slots],
  );
  const visibleSlots = provider === "All clinicians" ? slots : slots.filter((slot) => slot.provider === provider);
  const selectedSlot = slots.find((slot) => slot.id === selectedId) ?? null;
  const availableCount = slots.filter((slot) => slot.available).length;

  function unlock(event: FormEvent) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!key) {
      setError("Enter the API key to continue.");
      return;
    }
    sessionStorage.setItem("clinic-api-key", key);
    setApiKey(key);
    void loadSlots(key);
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ slot_id: selectedSlot.id, name, email }),
      });
      const confirmed = await readJson<Booking>(response);
      setBooking(confirmed);
      await loadSlots(apiKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your booking");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/bookings/${encodeURIComponent(booking.id)}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      const cancelled = await readJson<Booking>(response);
      setBooking(cancelled);
      await loadSlots(apiKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel your booking");
    } finally {
      setSubmitting(false);
    }
  }

  function changeKey() {
    sessionStorage.removeItem("clinic-api-key");
    setApiKey("");
    setKeyDraft("");
    setSlots([]);
    setBooking(null);
    setError("");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f8f4] text-[#16342d]">
      <div className="pointer-events-none fixed inset-0 opacity-60 [background-image:radial-gradient(#b9ccc2_0.7px,transparent_0.7px)] [background-size:18px_18px]" />

      <header className="relative z-10 border-b border-[#dce5de] bg-[#f6f8f4]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0f6a51] text-white shadow-[0_8px_24px_rgba(15,106,81,.2)]">
              <Stethoscope size={20} strokeWidth={2.2} />
            </span>
            <div>
              <p className="font-semibold tracking-[-0.02em]">Haven Clinic</p>
              <p className="text-xs text-[#668078]">Care, right on time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/manage" className="inline-flex items-center gap-2 rounded-full border border-[#d8e4dd] bg-white px-3 py-2 text-xs font-semibold text-[#33695a] shadow-sm transition hover:border-[#a9c8bb] hover:bg-[#edf6f1]">
              <CalendarPlus2 size={14} /> <span className="hidden sm:inline">Manage slots</span>
            </a>
            <a href="/docs" className="inline-flex items-center gap-2 rounded-full border border-[#d8e4dd] bg-white px-3 py-2 text-xs font-semibold text-[#33695a] shadow-sm transition hover:border-[#a9c8bb] hover:bg-[#edf6f1]">
              <FileText size={14} /> <span className="hidden sm:inline">API docs</span>
            </a>
            <div className="hidden items-center gap-2 rounded-full border border-[#d8e4dd] bg-white px-3 py-2 text-xs font-medium text-[#42665b] shadow-sm sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#27a47d] shadow-[0_0_0_4px_rgba(39,164,125,.12)]" />
              Booking service online
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="mb-10 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cfe0d7] bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#33705f]">
              <ShieldCheck size={14} /> Simple, secure scheduling
            </p>
            <h1 className="font-serif text-[clamp(2.7rem,6vw,5.6rem)] leading-[0.94] tracking-[-0.055em] text-[#143b32]">
              Your care should fit <span className="italic text-[#b45f3f]">your day.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#5a746c] sm:text-lg">
              Choose a clinician and a time that works. We’ll hold your appointment instantly and show the details right here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] border border-[#dce5de] bg-white/75 p-5 shadow-[0_14px_40px_rgba(36,69,58,.06)] backdrop-blur">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-[#0f6a51]">{apiKey ? availableCount : "—"}</p>
              <p className="mt-1 text-sm text-[#688078]">times available</p>
            </div>
            <div className="rounded-[24px] bg-[#163f35] p-5 text-white shadow-[0_14px_40px_rgba(22,63,53,.18)]">
              <p className="text-3xl font-semibold tracking-[-0.04em]">30<span className="text-lg text-[#9fc7b9]"> min</span></p>
              <p className="mt-1 text-sm text-[#b9d5cc]">typical visit</p>
            </div>
          </div>
        </div>

        {!apiKey ? (
          <form onSubmit={unlock} className="mx-auto mt-16 max-w-lg rounded-[28px] border border-[#d9e4dd] bg-white p-7 shadow-[0_24px_70px_rgba(26,65,53,.1)] sm:p-9">
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3ee] text-[#0f6a51]"><KeyRound size={22} /></span>
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">Enter the clinic access key</h2>
            <p className="mt-2 text-sm leading-6 text-[#668078]">This booking service is protected. Your key stays in this browser tab and is sent only to the API.</p>
            <label className="mt-6 block text-sm font-medium" htmlFor="api-key">API key</label>
            <div className="mt-2 flex rounded-2xl border border-[#cddbd3] bg-[#fbfcfa] p-1.5 focus-within:border-[#49957e] focus-within:ring-4 focus-within:ring-[#8fc3b2]/20">
              <input id="api-key" type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none" placeholder="Paste your API key" autoComplete="off" />
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#0f6a51] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5944]" type="submit">Continue <ArrowRight size={16} /></button>
            </div>
            {error && <p className="mt-4 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a44f32]">{error}</p>}
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-6">
              <section className="rounded-[28px] border border-[#d9e4dd] bg-white/85 p-5 shadow-[0_22px_60px_rgba(31,67,56,.08)] backdrop-blur sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f897f]">Step 1</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Choose an appointment</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void loadSlots(apiKey)} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7e2dc] text-[#547269] transition hover:bg-[#eef5f1]" aria-label="Refresh slots"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
                  <button type="button" onClick={changeKey} className="rounded-full border border-[#d7e2dc] px-3.5 py-2.5 text-xs font-medium text-[#547269] transition hover:bg-[#eef5f1]">Change key</button>
                </div>
              </div>

              <div className="mt-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {providers.map((item) => (
                  <button key={item} type="button" onClick={() => setProvider(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${provider === item ? "bg-[#163f35] text-white" : "bg-[#edf3ef] text-[#59736b] hover:bg-[#e2ede7]"}`}>{item}</button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {loading && slots.length === 0 ? (
                  <div className="col-span-full grid min-h-56 place-items-center text-[#6b817a]"><LoaderCircle className="animate-spin" /></div>
                ) : visibleSlots.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-[#cfdcd5] px-5 py-12 text-center text-sm text-[#6b817a]">No appointment slots are available yet.</div>
                ) : visibleSlots.map((slot) => {
                  const selected = slot.id === selectedId;
                  return (
                    <button key={slot.id} type="button" disabled={!slot.available} onClick={() => setSelectedId(slot.id)} className={`group relative rounded-[20px] border p-4 text-left transition ${selected ? "border-[#1d7a60] bg-[#edf7f2] shadow-[0_10px_28px_rgba(24,111,84,.1)]" : slot.available ? "border-[#dce5df] bg-white hover:-translate-y-0.5 hover:border-[#aac8ba] hover:shadow-md" : "cursor-not-allowed border-[#e4e8e5] bg-[#f7f8f6] opacity-55"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1ec] text-[#397260]"><CalendarDays size={17} /></span>
                        {selected ? <span className="grid h-6 w-6 place-items-center rounded-full bg-[#167356] text-white"><Check size={14} strokeWidth={3} /></span> : <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${slot.available ? "bg-[#e7f5ee] text-[#24775f]" : "bg-[#eceeed] text-[#79847f]"}`}>{slot.available ? "Available" : "Booked"}</span>}
                      </div>
                      <p className="mt-5 text-sm font-semibold text-[#264c41]">{slot.provider}</p>
                      <p className="mt-1 text-lg font-semibold tracking-[-0.025em]">{formatDay(slot.start)}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-[#647e75]"><Clock3 size={14} /> {formatTime(slot.start)} – {formatTime(slot.end)}</p>
                    </button>
                  );
                })}
              </div>
              </section>

              <BookingHistory
                key={booking?.id ?? "booking-history"}
                apiKey={apiKey}
                slots={slots}
                defaultEmail={booking?.email ?? ""}
                onCancelled={async (cancelled) => {
                  setBooking((current) => current?.id === cancelled.id ? cancelled : current);
                  await loadSlots(apiKey);
                }}
              />
            </div>

            <aside className="h-fit rounded-[28px] bg-[#153f35] p-6 text-white shadow-[0_24px_70px_rgba(21,63,53,.22)] sm:p-7 lg:sticky lg:top-6">
              {booking ? (
                <div>
                  <span className={`grid h-12 w-12 place-items-center rounded-full ${booking.status === "confirmed" ? "bg-[#d8f2e8] text-[#147356]" : "bg-white/10 text-white"}`}>
                    {booking.status === "confirmed" ? <CheckCircle2 size={25} /> : <X size={23} />}
                  </span>
                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-[#99c1b5]">{booking.status === "confirmed" ? "You’re booked" : "Booking cancelled"}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">{booking.status === "confirmed" ? "We’ll see you soon." : "Your time is free again."}</h2>
                  <div className="mt-7 space-y-4 rounded-[20px] border border-white/10 bg-white/[0.06] p-5">
                    <div><p className="text-xs text-[#9bc2b7]">Patient</p><p className="mt-1 font-medium">{booking.name}</p></div>
                    {selectedSlot && <div><p className="text-xs text-[#9bc2b7]">Appointment</p><p className="mt-1 font-medium">{formatDay(selectedSlot.start)}, {formatTime(selectedSlot.start)}</p><p className="mt-0.5 text-sm text-[#b7d3ca]">{selectedSlot.provider}</p></div>}
                    <div><p className="text-xs text-[#9bc2b7]">Reference</p><p className="mt-1 break-all font-mono text-xs text-[#d4e7e1]">{booking.id}</p></div>
                  </div>
                  {booking.status === "confirmed" && <button type="button" onClick={() => void cancelBooking()} disabled={submitting} className="mt-5 w-full rounded-2xl border border-white/20 px-4 py-3.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60">{submitting ? "Cancelling…" : "Cancel appointment"}</button>}
                  <button type="button" onClick={() => { setBooking(null); setName(""); setEmail(""); }} className="mt-3 w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-[#154437] transition hover:bg-[#edf5f1]">Book another time</button>
                </div>
              ) : (
                <form onSubmit={createBooking}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#99c1b5]">Step 2</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Confirm your details</h2>
                  {selectedSlot ? (
                    <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.07] p-4">
                      <p className="text-sm font-semibold">{selectedSlot.provider}</p>
                      <p className="mt-1 text-sm text-[#bad5cd]">{formatDay(selectedSlot.start)} · {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}</p>
                    </div>
                  ) : <div className="mt-5 rounded-[18px] border border-dashed border-white/20 p-4 text-sm text-[#b6d0c8]">Select an available time to continue.</div>}

                  <label className="mt-6 block text-sm font-medium" htmlFor="name">Full name</label>
                  <input id="name" value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3.5 text-sm text-white outline-none placeholder:text-[#8cada3] focus:border-[#74af9c] focus:ring-4 focus:ring-[#75b29e]/10" placeholder="Ada Obi" />
                  <label className="mt-5 block text-sm font-medium" htmlFor="email">Email address</label>
                  <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3.5 text-sm text-white outline-none placeholder:text-[#8cada3] focus:border-[#74af9c] focus:ring-4 focus:ring-[#75b29e]/10" placeholder="ada@example.com" />

                  {error && <p className="mt-4 rounded-xl bg-[#7b382d]/70 px-4 py-3 text-sm text-[#ffe0d8]">{error}</p>}
                  <button type="submit" disabled={!selectedSlot || submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e9f5ef] px-5 py-4 text-sm font-semibold text-[#174c3d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45">
                    {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Reserving…</> : <>Confirm appointment <ArrowRight size={17} /></>}
                  </button>
                  <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#9fc0b6]"><LockKeyhole size={14} className="mt-0.5 shrink-0" /> Your request is protected against duplicate bookings and accidental retries.</p>
                </form>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
