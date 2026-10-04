"use client";

// Module 3: a new hire works a case the expert never showed. The tutor watches the screen the same
// way the apprentice did, asks for predictions, and steps in before a guardrail is broken, replaying
// the expert's screen moment. Guardrail checks come straight from the Work Map.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ActivityPill, EventList, NoWorkMap, Orb, Transcript } from "@/components/panel";
import { SettingsButton } from "@/components/settings";
import { MomentPlayer } from "@/components/moment-player";
import { connectAgent } from "@/lib/agent-session";
import { loadDemoSession } from "@/lib/demo-workmap";
import type { ErpMessage, ErpState } from "@/lib/erp-bridge";
import { violations, type Violation } from "@/lib/guardrails";
import { tutorPrompt } from "@/lib/prompts";
import { TUTOR_GREETING, guardrailMsg, matchesNote, openedMsg, predictMsg, replayResult, saveOkMsg, screenNote, stepForGuardrail, stillViolatesNote } from "@/lib/protocol";
import type { MasteryItem, TranscriptLine, WorkMap, WorkMapStep } from "@/lib/schemas";
import { fmtT, loadSession, saveSession, type Session } from "@/lib/session-store";
import { useLatest } from "@/lib/use-latest";
import { useScreenWatch } from "@/lib/use-screen-watch";

type Phase = "idle" | "teaching" | "done";

function TeachPage() {
  const startedAt = useRef(0);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [replay, setReplay] = useState<WorkMapStep | null>(null);
  const [caught, setCaught] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const flagged = useRef(new Set<string>()); // invoice+guardrail already stepped in on
  const predicted = useRef(new Set<string>()); // invoices we asked a prediction for
  const openedAt = useRef<{ invoice: string; t: number; changed: boolean } | null>(null);
  const phaseRef = useLatest(phase);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  const map: WorkMap | undefined = session?.workMap;
  const now = () => Date.now() - startedAt.current;
  const pushLine = useCallback((l: TranscriptLine) => setTranscript((t) => [...t, l]), []);

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
        if (s) {
          setReplay(s);
          setTimeout(() => setReplay(null), 15_000);
        }
        return replayResult(s);
      },
      record_mastery: async ({ step, result, note }: { step: number; result: string; note?: string }) => {
        setMastery((m) => [...m.filter((x) => x.stepN !== Number(step)), { stepN: Number(step), result: result === "mastered" ? "mastered" : "practice", note: note ?? "" }]);
      },
      end_task: async () => {
        finish();
      },
    },
  });
  const convRef = useLatest(conv);

  function stepIn(v: Violation, st: ErpState, atSave: boolean) {
    const key = `${st.invoice}:${v.guardrail.id}`;
    if (flagged.current.has(key)) {
      conv.sendContextualUpdate(stillViolatesNote(v, st));
      return;
    }
    flagged.current.add(key);
    setCaught((c) => c + 1);
    conv.sendUserMessage(guardrailMsg(v, st, atSave, stepForGuardrail(map!, v.guardrail.id)));
  }

  const onErp = useCallback(
    (m: ErpMessage) => {
      if (phaseRef.current !== "teaching" || !map) return;
      if (m.type === "erp:event" && m.kind === "open") {
        openedAt.current = { invoice: m.invoice, t: Date.now(), changed: false };
        conv.sendUserMessage(openedMsg(m.summary));
        return;
      }
      if (m.type === "erp:event" && m.kind === "change") {
        if (openedAt.current) openedAt.current.changed = true;
        const v = violations(map.guardrails, m.state, false);
        if (v.length) stepIn(v[0], m.state, false);
        else conv.sendContextualUpdate(matchesNote(m.summary));
        return;
      }
      if (m.type === "erp:save-attempt") {
        const v = violations(map.guardrails, m.state, true);
        if (v.length) {
          iframe.current?.contentWindow?.postMessage({ type: "tutor:block-save", reason: `${v[0].guardrail.id}: ${v[0].guardrail.rule}` }, "*");
          stepIn(v[0], m.state, true);
        } else {
          iframe.current?.contentWindow?.postMessage({ type: "tutor:allow-save" }, "*");
          conv.sendUserMessage(saveOkMsg(m.state));
        }
        return;
      }
      if (m.type === "erp:event" && (m.kind === "hold" || m.kind === "save")) conv.sendContextualUpdate(screenNote({ t: now(), summary: m.summary }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, conv],
  );

  const watch = useScreenWatch({
    startedAtRef: startedAt,
    onErp,
    onEvents: (evs) => {
      if (phaseRef.current !== "teaching") return;
      for (const e of evs) if (e.source === "vision") convRef.current.sendContextualUpdate(screenNote(e));
    },
  });

  // Predict gate: the new hire opened a case and has been looking at it without changing anything.
  // Live values via refs, so the timer is created once (useConversation returns a new object per render).
  const gate = useLatest({ activity: watch.activity, lastState: watch.lastState });
  useEffect(() => {
    const id = window.setInterval(() => {
      const o = openedAt.current;
      const c = convRef.current;
      if (phaseRef.current !== "teaching" || !o || o.changed || c.status !== "connected" || c.isSpeaking) return;
      if (predicted.current.has(o.invoice) || Date.now() - o.t < 9000 || gate.current.activity !== "idle") return;
      predicted.current.add(o.invoice);
      c.sendUserMessage(predictMsg(o.invoice, gate.current.lastState));
    }, 500);
    return () => window.clearInterval(id);
  }, [gate, convRef, phaseRef]);

  async function start() {
    if (!map) return;
    setError(null);
    startedAt.current = Date.now();
    watch.reset();
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
    const err = await connectAgent(conv, { prompt: tutorPrompt(map, "two open invoices in the AP workbench, December close"), firstMessage: TUTOR_GREETING, language: "en" });
    if (err) setError(err);
    else setPhase("teaching");
  }

  function finish() {
    watch.stop();
    conv.endSession();
    setPhase("done");
    if (session) void saveSession({ ...session, mastery });
  }

  if (session === undefined) return <div className="p-10 text-zinc-400">Loading…</div>;
  if (!map) return <NoWorkMap title="No Work Map to teach from" onDemo={() => loadDemoSession().then(setSession)} />;

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
              <MomentPlayer recording={session?.recording} t={replay.screenMoment.t} fallbackUrl={replayFrame?.dataUrl} caption={replay.screenMoment.caption} className="h-48 w-full rounded object-contain ring-1 ring-white/10" />
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
          <SettingsButton />
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
