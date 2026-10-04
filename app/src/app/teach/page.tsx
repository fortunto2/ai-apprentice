"use client";

// Module 3: a new hire works a case the expert never showed. The tutor watches the screen the same
// way the apprentice did, asks for predictions, and steps in before a guardrail is broken, replaying
// the expert's screen moment. Guardrail checks come straight from the Work Map.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ActivityPill, EventList, Orb, Transcript } from "@/components/panel";
import { DEMO_WORKMAP } from "@/lib/demo-workmap";
import type { ErpMessage, ErpState } from "@/lib/erp-bridge";
import { describeCond, violations } from "@/lib/guardrails";
import { tutorPrompt } from "@/lib/prompts";
import type { MasteryItem, TranscriptLine, WorkMap, WorkMapStep } from "@/lib/schemas";
import { fmtT, loadSession, saveSession, type Session } from "@/lib/session-store";
import { useScreenWatch } from "@/lib/use-screen-watch";

type Phase = "idle" | "teaching" | "done";

function TeachPage() {
  const startedAt = useRef(0);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [replay, setReplay] = useState<WorkMapStep | null>(null);
  const [caught, setCaught] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const flagged = useRef(new Set<string>()); // invoice+guardrail already stepped in on
  const predicted = useRef(new Set<string>()); // invoices we asked a prediction for
  const openedAt = useRef<{ invoice: string; t: number; changed: boolean } | null>(null);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  const map: WorkMap | undefined = session?.workMap;
  const now = () => Date.now() - startedAt.current;

  const pushLine = useCallback((l: TranscriptLine) => {
    transcriptRef.current = [...transcriptRef.current, l];
    setTranscript(transcriptRef.current);
  }, []);

  const conv = useConversation({
    onMessage: ({ message, source }) => {
      if (!message?.trim()) return;
      pushLine({ t: now(), role: source === "ai" ? "tutor" : "newhire", text: message });
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > 0.6) watch.markActivity("talking");
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") watch.markActivity("agent");
    },
    onError: (m) => setError(m),
    clientTools: {
      replay_moment: async ({ step }: { step: number }) => {
        const s = map?.steps.find((x) => x.n === Number(step));
        if (!s) return "No such step.";
        setReplay(s);
        setTimeout(() => setReplay(null), 15_000);
        return `Showing the expert's screen moment for step ${s.n} (${fmtT(s.screenMoment.t)}: ${s.screenMoment.caption}). Expert said: "${s.reason.quote}"`;
      },
      record_mastery: async ({ step, result, note }: { step: number; result: string; note?: string }) => {
        setMastery((m) => [...m.filter((x) => x.stepN !== Number(step)), { stepN: Number(step), result: result === "mastered" ? "mastered" : "practice", note: note ?? "" }]);
      },
      end_task: async () => {
        finish();
      },
    },
  });

  function stepIn(gid: string, expected: { field: string; op: string; value?: string | null }, st: ErpState, atSave: boolean) {
    const key = `${st.invoice}:${gid}`;
    const g = map!.guardrails.find((x) => x.id === gid)!;
    if (flagged.current.has(key)) {
      conv.sendContextualUpdate(`[SCREEN] ${st.invoice} still violates ${gid} (${describeCond(expected as never)}).`);
      return;
    }
    flagged.current.add(key);
    setCaught((c) => c + 1);
    const stepN = g.stepN ?? map!.steps.find((s) => s.guardrailIds.includes(gid))?.n ?? 1;
    conv.sendUserMessage(
      `[GUARDRAIL] ${atSave ? "The new hire is about to SAVE" : "The new hire just set"} ${st.invoice} (${st.supplier}, €${st.amount}) with cost center ${st.cost_center}, asset ${st.asset_number || "none"}, approval ${st.approval}, status ${st.status}. This breaks guardrail ${gid}: ${g.rule} (expected ${describeCond(expected as never)}). The expert's words: "${g.quote ?? ""}". Step in now: say the expert would stop here and ask why they think so, then call replay_moment with step ${stepN}, explain the rule in the expert's words, and say what to change. ${atSave ? "The save is paused until they fix it." : ""}`,
    );
  }

  const onErp = useCallback(
    (m: ErpMessage) => {
      if (phaseRef.current !== "teaching" || !map) return;
      if (m.type === "erp:event" && m.kind === "open") {
        openedAt.current = { invoice: m.invoice, t: Date.now(), changed: false };
        conv.sendUserMessage(`[SCREEN] ${m.summary}. Orient the new hire in one sentence (what this case is, what to look at), do not reveal the decision.`);
        return;
      }
      if (m.type === "erp:event" && m.kind === "change") {
        if (openedAt.current) openedAt.current.changed = true;
        const v = violations(map.guardrails, m.state, false);
        if (v.length) stepIn(v[0].guardrail.id, v[0].expected, m.state, false);
        else conv.sendContextualUpdate(`[SCREEN] ${m.summary}. This matches the expert's rules so far.`);
        return;
      }
      if (m.type === "erp:save-attempt") {
        const v = violations(map.guardrails, m.state, true);
        if (v.length) {
          iframe.current?.contentWindow?.postMessage({ type: "tutor:block-save", reason: `${v[0].guardrail.id}: ${v[0].guardrail.rule}` }, "*");
          stepIn(v[0].guardrail.id, v[0].expected, m.state, true);
        } else {
          iframe.current?.contentWindow?.postMessage({ type: "tutor:allow-save" }, "*");
          conv.sendUserMessage(`[SCREEN] The new hire is saving ${m.state.invoice} with cost center ${m.state.cost_center}, asset ${m.state.asset_number || "none"}, approval ${m.state.approval}, status ${m.state.status}. This satisfies all guardrails. Confirm in one sentence using the expert's reason, and call record_mastery for the matching step with result "mastered".`);
        }
        return;
      }
      if (m.type === "erp:event" && (m.kind === "hold" || m.kind === "save")) {
        conv.sendContextualUpdate(`[SCREEN] ${m.summary}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, conv],
  );

  const watch = useScreenWatch({
    startedAtRef: startedAt,
    onErp,
    onEvents: (evs) => {
      if (phaseRef.current !== "teaching") return;
      for (const e of evs) if (e.source === "vision") conv.sendContextualUpdate(`[SCREEN] ${fmtT(e.t)} ${e.summary}`);
    },
  });

  // Predict gate: the new hire opened a case and has been looking at it without changing anything.
  useEffect(() => {
    const id = window.setInterval(() => {
      const o = openedAt.current;
      if (phaseRef.current !== "teaching" || !o || o.changed || conv.status !== "connected" || conv.isSpeaking) return;
      if (predicted.current.has(o.invoice) || Date.now() - o.t < 9000 || watch.activity !== "idle") return;
      predicted.current.add(o.invoice);
      const st = watch.lastState;
      conv.sendUserMessage(`[PREDICT] The new hire has been looking at ${o.invoice}${st ? ` (${st.supplier}, €${st.amount}, cost center ${st.cost_center}, approval ${st.approval})` : ""} for a few seconds without changing anything. Ask them to predict what the expert would do with this one and why. One question.`);
    }, 500);
    return () => window.clearInterval(id);
  }, [conv, watch.activity, watch.lastState]);

  async function start() {
    if (!map) return;
    setError(null);
    startedAt.current = Date.now();
    watch.reset();
    transcriptRef.current = [];
    setTranscript([]);
    setMastery([]);
    setCaught(0);
    flagged.current.clear();
    predicted.current.clear();
    try {
      await watch.start();
    } catch {
      // No screen share: the tutor still gets app events. Vision events are a bonus.
    }
    const r = await fetch("/api/agent/token");
    const data = (await r.json()) as { signedUrl?: string; error?: string };
    if (!data.signedUrl) {
      setError(data.error ?? "no signed url");
      return;
    }
    await navigator.mediaDevices.getUserMedia({ audio: true });
    conv.startSession({
      signedUrl: data.signedUrl,
      connectionType: "websocket",
      overrides: {
        agent: {
          prompt: { prompt: tutorPrompt(map, "two open invoices in the AP workbench, December close") },
          firstMessage: "Hi, I'm your tutor today. I learned this job from Sabine, so I'll coach you the way she thinks. Open the first invoice whenever you're ready, and tell me what you see.",
          language: "en",
        },
      },
    });
    setPhase("teaching");
  }

  function finish() {
    watch.stop();
    conv.endSession();
    setPhase("done");
    if (session) void saveSession({ ...session, mastery });
  }

  async function useDemo() {
    // Prefer the session produced by the eval run (real frames + events); fall back to the static map.
    let s: Session = { id: "demo", startedAt: Date.now(), events: [], frames: [], transcript: [], workMap: DEMO_WORKMAP };
    try {
      const r = await fetch("/demo-session.json", { cache: "no-store" });
      if (r.ok) s = (await r.json()) as Session;
    } catch {
      /* static fallback */
    }
    await saveSession(s);
    setSession(s);
  }

  if (session === undefined) return <div className="p-10 text-zinc-400">Loading…</div>;
  if (!map)
    return (
      <div className="mx-auto max-w-xl p-10 text-zinc-200">
        <h1 className="text-xl font-semibold">No Work Map to teach from</h1>
        <div className="mt-4 flex gap-2">
          <Link href="/capture" className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black">Go to Capture</Link>
          <button onClick={useDemo} className="rounded border border-white/15 px-3 py-1.5 text-sm">Load demo Work Map</button>
        </div>
      </div>
    );

  const connected = conv.status === "connected";
  const replayFrame = replay?.screenMoment.frameId ? session?.frames.find((f) => f.id === replay.screenMoment.frameId) : undefined;

  return (
    <div className="grid h-screen grid-cols-[1fr_420px] bg-zinc-950 text-zinc-100">
      <div className="relative h-full">
        <iframe ref={iframe} src="/erp?mode=newhire" className="h-full w-full border-0 bg-white" title="ERP sandbox, new hire" />
        {replay && (
          <div className="absolute inset-x-10 top-10 rounded-xl border border-violet-400/40 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur" onClick={() => setReplay(null)}>
            <div className="text-xs uppercase tracking-wide text-violet-300">Expert&apos;s screen moment · step {replay.n} · {fmtT(replay.screenMoment.t)}</div>
            <div className="mt-1 text-lg font-medium">{replay.title}</div>
            <div className="mt-3 grid grid-cols-[1fr_1fr] gap-4">
              {replayFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={replayFrame.dataUrl} alt="" className="w-full rounded ring-1 ring-white/10" />
              ) : (
                <div className="flex h-48 items-center justify-center rounded bg-white/5 text-xs text-zinc-500">{replay.screenMoment.caption}</div>
              )}
              <div>
                <div className="text-sm text-zinc-300">{replay.decision}</div>
                {replay.reason.quote && <blockquote className="mt-3 border-l-2 border-violet-400 pl-3 italic text-zinc-100">“{replay.reason.quote}”</blockquote>}
                <div className="mt-2 text-[11px] text-zinc-500">Sabine, {replay.reason.source === "live" ? "live question" : replay.reason.source} {replay.reason.t != null && `at ${fmtT(replay.reason.t)}`}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="flex h-full flex-col border-l border-white/10 bg-zinc-900">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Orb mode={conv.mode} connected={connected} />
          <div className="flex-1">
            <div className="text-sm font-semibold">Voice tutor</div>
            <ActivityPill activity={watch.activity} idleMs={watch.idleMs} connected={connected} />
          </div>
          <div className="text-right text-[11px] text-zinc-400">
            <div>{phase}</div>
            <div>{caught} caught · {mastery.filter((m) => m.result === "mastered").length} mastered</div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2">
          {phase !== "teaching" ? (
            <button onClick={start} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400">Start tutoring</button>
          ) : (
            <button onClick={finish} className="rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-400">Finish session</button>
          )}
          <Link href="/map" className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5">Work Map</Link>
        </div>
        {error && <div className="mx-4 mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}

        <section className="border-b border-white/10 px-4 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Guardrails in force (from the Work Map)</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-400">
            {map.guardrails.map((g) => (
              <li key={g.id}>
                <span className="mr-1 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">{g.id}</span>
                {g.rule}
              </li>
            ))}
          </ul>
        </section>

        {phase === "done" && (
          <section className="border-b border-white/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">What the new hire learned</div>
            <ul className="mt-1 space-y-1 text-xs">
              {map.steps.map((s) => {
                const m = mastery.find((x) => x.stepN === s.n);
                return (
                  <li key={s.n} className="flex gap-2">
                    <span className={`w-16 shrink-0 rounded px-1 text-center text-[10px] ${m?.result === "mastered" ? "bg-emerald-500/20 text-emerald-300" : m ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-zinc-500"}`}>{m?.result ?? "not seen"}</span>
                    <span>
                      {s.title}
                      {m?.note && <span className="text-zinc-500"> · {m.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div className="mb-1 px-1.5 text-[11px] uppercase tracking-wide text-zinc-500">New hire&apos;s screen</div>
          <EventList events={watch.events} frames={watch.frames} />
        </section>
        <section className="max-h-[34%] overflow-y-auto border-t border-white/10 px-3 py-2">
          <div className="mb-1 px-1.5 text-[11px] uppercase tracking-wide text-zinc-500">Conversation</div>
          <Transcript lines={transcript} />
        </section>
      </aside>
    </div>
  );
}

export default function Page() {
  return (
    <ConversationProvider>
      <TeachPage />
    </ConversationProvider>
  );
}
