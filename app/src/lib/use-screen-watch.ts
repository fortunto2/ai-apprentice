"use client";

// Watches a screen: getDisplayMedia frames → diff → vision model → events, plus DOM-mirrored
// events from the sandbox ERP iframe. Also tracks "is the user busy" for the pause gate.

import { useCallback, useEffect, useRef, useState } from "react";
import { FrameCapture, type Frame } from "./frame-capture";
import type { ErpMessage, ErpState } from "./erp-bridge";
import type { ScreenEvent, VisionResult } from "./schemas";

export type Activity = "typing" | "mouse" | "talking" | "agent" | "idle";

export type ScreenWatch = {
  active: boolean;
  events: ScreenEvent[];
  frames: Frame[];
  activity: Activity;
  idleMs: number;
  lastState: ErpState | null;
  visionBusy: boolean;
  piiSeen: Set<string>;
  start: () => Promise<void>;
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
  const [active, setActive] = useState(false);
  const [events, setEvents] = useState<ScreenEvent[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [activity, setActivity] = useState<Activity>("idle");
  const [idleMs, setIdleMs] = useState(0);
  const [lastState, setLastState] = useState<ErpState | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [piiSeen] = useState(() => new Set<string>());

  const capture = useRef<FrameCapture | null>(null);
  const lastSent = useRef<Frame | null>(null);
  const inflight = useRef(false);
  const seq = useRef(0);
  const eventsRef = useRef<ScreenEvent[]>([]);
  const lastActivity = useRef<{ t: number; a: Exclude<Activity, "idle"> }>({ t: 0, a: "mouse" });
  const onEventsRef = useRef(opts.onEvents);
  const onErpRef = useRef(opts.onErp);
  useEffect(() => {
    onEventsRef.current = opts.onEvents;
    onErpRef.current = opts.onErp;
  });

  const now = () => Date.now() - opts.startedAtRef.current;

  const pushEvents = useCallback((evs: ScreenEvent[]) => {
    if (!evs.length) return;
    eventsRef.current = [...eventsRef.current, ...evs];
    setEvents(eventsRef.current);
    onEventsRef.current?.(evs);
  }, []);

  const markActivity = useCallback((a: Exclude<Activity, "idle">) => {
    lastActivity.current = { t: Date.now(), a };
  }, []);

  // Idle clock
  useEffect(() => {
    const id = window.setInterval(() => {
      const dt = Date.now() - lastActivity.current.t;
      setIdleMs(dt);
      setActivity(dt > 2500 ? "idle" : lastActivity.current.a);
    }, 250);
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
      inflight.current = true;
      setVisionBusy(true);
      const prev = lastSent.current;
      lastSent.current = frame;
      setFrames((f) => [...f.slice(-400), frame]);
      try {
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prev: prev?.dataUrl ?? null, curr: frame.dataUrl, recent: eventsRef.current.slice(-8).map((e) => e.summary) }),
        });
        const data = (await res.json()) as ({ ok: true } & VisionResult) | { ok: false; error: string };
        if (!data.ok) {
          console.warn("vision", data.error);
          return;
        }
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
      } finally {
        inflight.current = false;
        setVisionBusy(false);
      }
    },
    [piiSeen, pushEvents],
  );

  const start = useCallback(async () => {
    const fc = new FrameCapture({
      startedAt: opts.startedAtRef.current,
      intervalMs: opts.intervalMs ?? 1500,
      onFrame: (frame, changed) => {
        if (changed) void analyze(frame);
      },
    });
    await fc.start();
    capture.current = fc;
    setActive(true);
    markActivity("mouse");
  }, [analyze, markActivity, opts.intervalMs, opts.startedAtRef]);

  const stop = useCallback(() => {
    capture.current?.stop();
    capture.current = null;
    setActive(false);
  }, []);

  // Off the record: drop events in the last `ms`. Returns how many.
  const redactSince = useCallback((ms: number) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    eventsRef.current = [];
    setEvents([]);
    setFrames([]);
    lastSent.current = null;
    seq.current = 0;
  }, []);

  return { active, events, frames, activity, idleMs, lastState, visionBusy, piiSeen, start, stop, markActivity, redactSince, reset };
}
