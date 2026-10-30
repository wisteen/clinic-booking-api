"use client";

import { ArrowLeft, CalendarPlus2, CheckCircle2, Clock3, KeyRound, LoaderCircle, Plus, RefreshCw, Stethoscope } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Slot = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong", response.status);
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

export default function ManageSlots() {
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [provider, setProvider] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        sessionStorage.removeItem("clinic-api-key");
        setApiKey("");
      }
      setError(reason instanceof Error ? reason.message : "Could not load slots");
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

  function unlock(event: FormEvent) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!key) return;
    sessionStorage.setItem("clinic-api-key", key);
    setApiKey(key);
    void loadSlots(key);
  }

  async function addSlot(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      setError("Choose a valid start and end time.");
      return;
    }
    if (startTime <= Date.now()) {
      setError("The start time must be in the future.");
      return;
    }
    if (endTime <= startTime) {
      setError("The end time must be later than the start time.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/slots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          id: `slot_${crypto.randomUUID()}`,
          provider,
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
        }),
      });
      const created = await readJson<Slot>(response);
      setSlots((current) => [...current, created].sort((a, b) => a.start.localeCompare(b.start)));
      setProvider("");
      setStart("");
      setEnd("");
      setSuccess("The new appointment slot is available for booking.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add slot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f8f4] text-[#16342d]">
      <header className="border-b border-[#dce5de] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0f6a51] text-white"><Stethoscope size={20} /></span>
            <div><p className="font-semibold">Haven Clinic</p><p className="text-xs text-[#668078]">Slot management</p></div>
          </a>
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-[#d8e4dd] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#42665b] shadow-sm hover:bg-[#eef5f1]"><ArrowLeft size={15} /> Booking page</a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#e7f3ed] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#286d59]"><CalendarPlus2 size={14} /> Availability</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Manage appointment slots</h1>
          <p className="mt-4 leading-7 text-[#607970]">Add new times without resetting the database or affecting existing bookings.</p>
        </div>

        {!apiKey ? (
          <form onSubmit={unlock} className="max-w-lg rounded-[28px] border border-[#d9e4dd] bg-white p-7 shadow-[0_20px_60px_rgba(31,67,56,.08)]">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3ee] text-[#0f6a51]"><KeyRound size={20} /></span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Enter the clinic API key</h2>
            <p className="mt-2 text-sm leading-6 text-[#668078]">Slot management uses the same protected API key as the booking page.</p>
            <div className="mt-5 flex rounded-2xl border border-[#cddbd3] bg-[#fbfcfa] p-1.5 focus-within:border-[#49957e]">
              <input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none" placeholder="Paste your API key" />
              <button type="submit" className="rounded-xl bg-[#0f6a51] px-4 py-2.5 text-sm font-semibold text-white">Continue</button>
            </div>
            {error && <p className="mt-4 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a44f32]">{error}</p>}
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
            <form onSubmit={addSlot} className="h-fit rounded-[28px] bg-[#153f35] p-6 text-white shadow-[0_24px_70px_rgba(21,63,53,.2)] sm:p-7 lg:sticky lg:top-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#99c1b5]">New availability</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Add a slot</h2>

              <label className="mt-6 block text-sm font-medium" htmlFor="provider">Provider</label>
              <input id="provider" required value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3.5 text-sm outline-none placeholder:text-[#8cada3] focus:border-[#74af9c]" placeholder="Dr Ade" />

              <label className="mt-5 block text-sm font-medium" htmlFor="start">Starts</label>
              <input id="start" type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3.5 text-sm outline-none [color-scheme:dark] focus:border-[#74af9c]" />

              <label className="mt-5 block text-sm font-medium" htmlFor="end">Ends</label>
              <input id="end" type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3.5 text-sm outline-none [color-scheme:dark] focus:border-[#74af9c]" />

              {error && <p className="mt-4 rounded-xl bg-[#7b382d]/70 px-4 py-3 text-sm text-[#ffe0d8]">{error}</p>}
              {success && <p className="mt-4 flex gap-2 rounded-xl bg-[#236b56] px-4 py-3 text-sm text-[#ddf4ec]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /> {success}</p>}

              <button type="submit" disabled={saving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e9f5ef] px-5 py-4 text-sm font-semibold text-[#174c3d] hover:bg-white disabled:opacity-50">
                {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
                {saving ? "Adding slot…" : "Add available slot"}
              </button>
            </form>

            <section className="rounded-[28px] border border-[#d9e4dd] bg-white p-5 shadow-[0_20px_60px_rgba(31,67,56,.07)] sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f897f]">Schedule</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">All slots <span className="text-[#789087]">({slots.length})</span></h2></div>
                <button type="button" onClick={() => void loadSlots(apiKey)} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7e2dc] text-[#547269] hover:bg-[#eef5f1]" aria-label="Refresh slots"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
              </div>

              <div className="mt-5 space-y-3">
                {loading && slots.length === 0 ? <div className="grid min-h-44 place-items-center"><LoaderCircle className="animate-spin text-[#4b796a]" /></div> : slots.map((slot) => (
                  <article key={slot.id} className="flex flex-col gap-3 rounded-[18px] border border-[#dce5df] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-semibold text-[#264c41]">{slot.provider}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-[#647e75]"><Clock3 size={14} /> {formatDate(slot.start)}</p></div>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${slot.available ? "bg-[#e7f5ee] text-[#24775f]" : "bg-[#eceeed] text-[#707c76]"}`}>{slot.available ? "Available" : "Booked"}</span>
                  </article>
                ))}
                {!loading && slots.length === 0 && <div className="rounded-2xl border border-dashed border-[#cfdcd5] px-5 py-12 text-center text-sm text-[#6b817a]">No slots yet. Add the first one.</div>}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
