"use client";

// Watches a screen: getDisplayMedia frames → diff → vision model → events, plus DOM-mirrored
// events from the sandbox ERP iframe. Also tracks "is the user busy" for the pause gate.

import { useCallback, useEffect, useRef, useState } from "react";
import { FrameCapture, type Frame } from "./frame-capture";
import type { ErpMessage, ErpState } from "./erp-bridge";
import type { ScreenEvent, VisionResult } from "./schemas";
import { keyHeaders } from "./byok";
import { useLatest } from "./use-latest";

export type Activity = "typing" | "mouse" | "talking" | "agent" | "idle";

const IDLE_AFTER_MS = 2500;

export type ScreenWatch = {
  events: ScreenEvent[];
  frames: Frame[];
  activity: Activity;
  idleMs: number;
  lastState: ErpState | null;
  piiSeen: Set<string>;
  visionError: string | null; // last vision failure, so an empty quota is visible instead of silent
  start: () => Promise<MediaStream>;
  stop: () => void;
  markActivity: (a: Exclude<Activity, "idle">) => void;
  redactSince: (ms: number) => number;
  reset: () => void;
};

export function useScreenWatch(opts: {
  startedAtRef: React.MutableRefObject<number>;
  onEvents?: (events: ScreenEvent[]) => void;
  onErp?: (msg: ErpMessage) => void;
  intervalMs?: number;
}): ScreenWatch {
  const [events, setEvents] = useState<ScreenEvent[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [activity, setActivity] = useState<Activity>("idle");
  const [idleMs, setIdleMs] = useState(0);
  const [lastState, setLastState] = useState<ErpState | null>(null);
  const [piiSeen] = useState(() => new Set<string>());
  const [visionError, setVisionError] = useState<string | null>(null);
  const pausedUntil = useRef(0); // after a quota error, stop paying for 429s for a while

  const capture = useRef<FrameCapture | null>(null);
  const lastSent = useRef<Frame | null>(null);
  const inflight = useRef(false);
  const seq = useRef(0);
  const eventsRef = useRef<ScreenEvent[]>([]);
  const lastActivity = useRef<{ t: number; a: Exclude<Activity, "idle"> }>({ t: 0, a: "mouse" });
  const onEventsRef = useLatest(opts.onEvents);
  const onErpRef = useLatest(opts.onErp);

  const now = () => Date.now() - opts.startedAtRef.current;

  const pushEvents = useCallback(
    (evs: ScreenEvent[]) => {
      if (!evs.length) return;
      eventsRef.current = [...eventsRef.current, ...evs];
      setEvents(eventsRef.current);
      onEventsRef.current?.(evs);
    },
    [onEventsRef],
  );

  const markActivity = useCallback((a: Exclude<Activity, "idle">) => {
    lastActivity.current = { t: Date.now(), a };
  }, []);

  // Idle clock. Whole seconds, so unchanged values do not re-render the page.
  useEffect(() => {
    const id = window.setInterval(() => {
      const dt = Date.now() - lastActivity.current.t;
      setIdleMs(Math.floor(dt / 1000) * 1000);
      setActivity(dt > IDLE_AFTER_MS ? "idle" : lastActivity.current.a);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // DOM-mirrored events from the ERP iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent<ErpMessage>) => {
      const m = e.data;
      if (!m || typeof m !== "object" || !("type" in m)) return;
      if (m.type === "erp:activity") {
        markActivity(m.kind === "key" ? "typing" : "mouse");
        return;
      }
      onErpRef.current?.(m);
      if (m.type === "erp:event") {
        setLastState(m.state);
        pushEvents([
          {
            id: `d${++seq.current}`,
            t: now(),
            source: "dom",
            kind: m.kind,
            summary: m.summary,
            invoice: m.invoice,
            field: m.field ?? null,
            from: m.from ?? null,
            to: m.to ?? null,
            frameId: lastSent.current?.id ?? null,
          },
        ]);
      }
      if (m.type === "erp:save-attempt") setLastState(m.state);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback(
    async (frame: Frame) => {
      if (inflight.current) return;
      setFrames((f) => [...f.slice(-400), frame]);
      if (Date.now() < pausedUntil.current) return;
      inflight.current = true;
      const prev = lastSent.current;
      lastSent.current = frame;
      try {
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "content-type": "application/json", ...keyHeaders() },
          body: JSON.stringify({ prev: prev?.dataUrl ?? null, curr: frame.dataUrl, recent: eventsRef.current.slice(-8).map((e) => e.summary) }),
        });
        const data = (await res.json()) as ({ ok: true } & VisionResult) | { ok: false; error: string };
        if (!data.ok) {
          console.warn("vision", data.error);
          setVisionError(data.error);
          if (/exhausted|quota|429/i.test(data.error)) pausedUntil.current = Date.now() + 60_000;
          return;
        }
        setVisionError(null);
        data.piiSeen.forEach((p) => piiSeen.add(p));
        // Dedupe against DOM events: same invoice+field+to within the last 6 s is the same thing.
        const recent = eventsRef.current.filter((e) => frame.t - e.t < 6000);
        const fresh = data.events.filter(
          (v) => !recent.some((e) => e.kind === v.kind && (e.invoice ?? null) === v.invoice && (e.field ?? null) === v.field && (e.to ?? null) === v.to),
        );
        pushEvents(
          fresh.map((v) => ({
            id: `v${++seq.current}`,
            t: frame.t,
            source: "vision" as const,
            kind: v.kind,
            summary: v.summary,
            invoice: v.invoice,
            field: v.field,
            from: v.from,
            to: v.to,
            frameId: frame.id,
          })),
        );
      } catch (e) {
        console.warn("vision failed", e);
        setVisionError(String(e));
      } finally {
        inflight.current = false;
      }
    },
    [piiSeen, pushEvents],
  );

  // Returns the display stream so callers can also record it.
  const start = useCallback(async () => {
    const fc = new FrameCapture({ startedAt: opts.startedAtRef.current, intervalMs: opts.intervalMs ?? 1500, onFrame: (frame) => void analyze(frame) });
    const stream = await fc.start();
    capture.current = fc;
    markActivity("mouse");
    return stream;
  }, [analyze, markActivity, opts.intervalMs, opts.startedAtRef]);

  const stop = useCallback(() => {
    capture.current?.stop();
    capture.current = null;
  }, []);

  // Off the record: drop events in the last `ms`. Returns how many.
  const redactSince = useCallback(
    (ms: number) => {
      const cutoff = now() - ms;
      let n = 0;
      eventsRef.current = eventsRef.current.map((e) => {
        if (e.t >= cutoff && !e.redacted) {
          n++;
          return { ...e, redacted: true, summary: "[off the record]" };
        }
        return e;
      });
      setEvents(eventsRef.current);
      return n;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const reset = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
    setFrames([]);
    lastSent.current = null;
    seq.current = 0;
  }, []);

  return { events, frames, activity, idleMs, lastState, piiSeen, visionError, start, stop, markActivity, redactSince, reset };
}
