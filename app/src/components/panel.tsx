"use client";

import type { Frame } from "@/lib/frame-capture";
import type { ScreenEvent, TranscriptLine } from "@/lib/schemas";
import { fmtT } from "@/lib/session-store";
import type { Activity } from "@/lib/use-screen-watch";

export function ActivityPill({ activity, idleMs, connected }: { activity: Activity; idleMs: number; connected: boolean }) {
  const label =
    activity === "typing" ? "expert typing" : activity === "mouse" ? "expert working" : activity === "talking" ? "expert talking" : activity === "agent" ? "apprentice speaking" : `pause ${Math.round(idleMs / 1000)}s`;
  const color = activity === "idle" ? "bg-emerald-500" : activity === "agent" ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <span className={`inline-block h-2 w-2 rounded-full ${connected ? color : "bg-zinc-600"}`} />
      {connected ? label : "voice offline"}
    </div>
  );
}

export function EventList({ events, frames, onPick }: { events: ScreenEvent[]; frames: Frame[]; onPick?: (e: ScreenEvent) => void }) {
  const frameById = new Map(frames.map((f) => [f.id, f]));
  return (
    <ol className="flex flex-col gap-1.5">
      {events.map((e) => {
        const f = e.frameId ? frameById.get(e.frameId) : undefined;
        return (
          <li key={e.id}>
            <button onClick={() => onPick?.(e)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/5">
              <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500">{fmtT(e.t)}</span>
              {f ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.dataUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover ring-1 ring-white/10" />
              ) : (
                <span className="h-9 w-14 shrink-0 rounded bg-white/5" />
              )}
              <span className={`text-xs leading-snug ${e.redacted ? "italic text-zinc-500" : "text-zinc-200"}`}>
                <span className={`mr-1 rounded px-1 text-[10px] uppercase ${e.source === "vision" ? "bg-sky-500/20 text-sky-300" : "bg-zinc-500/20 text-zinc-400"}`}>{e.source === "vision" ? "seen" : "app"}</span>
                {e.summary}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Transcript({ lines }: { lines: TranscriptLine[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-500">{fmtT(l.t)}</span>
          <span className={`${l.role === "expert" || l.role === "newhire" ? "text-zinc-100" : "text-violet-300"} ${l.redacted ? "italic text-zinc-500" : ""}`}>
            <span className="mr-1 text-[10px] uppercase text-zinc-500">{l.role}</span>
            {l.redacted ? "[off the record]" : l.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Orb({ mode, connected }: { mode: "speaking" | "listening"; connected: boolean }) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <div className={`absolute inset-0 rounded-full ${connected ? (mode === "speaking" ? "animate-ping bg-violet-500/30" : "bg-emerald-500/10") : "bg-zinc-700/30"}`} />
      <div className={`h-9 w-9 rounded-full ${connected ? (mode === "speaking" ? "bg-violet-400" : "bg-emerald-400") : "bg-zinc-600"} shadow-lg`} />
    </div>
  );
}
