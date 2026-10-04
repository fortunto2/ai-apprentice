"use client";

// Module 1 + 2: the expert works in the sandbox ERP (iframe, left) while the apprentice watches
// the shared screen and listens (right). Pause gate decides WHEN to ask; the agent decides WHAT.
// "End task" → Work Map draft → spoken debrief → teach-back → confirmed Work Map.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ActivityPill, EventList, Orb, Transcript } from "@/components/panel";
import { SettingsButton } from "@/components/settings";
import { connectAgent } from "@/lib/agent-session";
import { keyHeaders } from "@/lib/byok";
import { debriefPrompt, interviewerPrompt } from "@/lib/prompts";
import { DEFAULT_GAP, LANGS, langOf, offTheRecordResult, pauseMsg, screenNote, struckNote, type Lang } from "@/lib/protocol";
import type { ScreenEvent, TranscriptLine, WorkMap } from "@/lib/schemas";
import { fmtT, saveSession, type Session } from "@/lib/session-store";
import { ScreenRecorder } from "@/lib/screen-recorder";
import { useLatest } from "@/lib/use-latest";
import { useScreenWatch } from "@/lib/use-screen-watch";

type Phase = "idle" | "capturing" | "synthesizing" | "debrief" | "finalizing" | "done";
type WorkMapResult = { ok: true; workMap: WorkMap } | { ok: false; error: string };

const MIN_GAP_MS = 40_000; // between questions
const BUDGET_PER_10MIN = 5;

async function postWorkMap(body: object): Promise<WorkMapResult> {
  const res = await fetch("/api/workmap", { method: "POST", headers: { "content-type": "application/json", ...keyHeaders() }, body: JSON.stringify(body) });
  return (await res.json()) as WorkMapResult;
}

function CapturePage() {
  const startedAt = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [questions, setQuestions] = useState(0);
  const [mask, setMask] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [workMap, setWorkMap] = useState<WorkMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScreenEvent | null>(null);
  const [gateInfo, setGateInfo] = useState({ unasked: 0, waitS: 0, budget: 0, reason: "" });
  const iframe = useRef<HTMLIFrameElement>(null);
  const lastAsk = useRef(0);
  const unaskedEvents = useRef<ScreenEvent[]>([]);
  const debriefStartT = useRef(0);
  const recorder = useRef(new ScreenRecorder());
  const recording = useRef<Blob | null>(null);
  const phaseRef = useLatest(phase);
  const transcriptRef = useLatest(transcript);

  // eslint-disable-next-line react-hooks/purity -- only called from handlers and callbacks
  const now = () => Date.now() - startedAt.current;
  const pushLine = useCallback((l: TranscriptLine) => setTranscript((t) => [...t, l]), []);

  const conv = useConversation({
    onMessage: ({ message, source }) => {
      if (!message?.trim()) return;
      if (source === "ai" && phaseRef.current === "capturing") setQuestions((q) => q + 1);
      pushLine({ t: now(), role: source === "ai" ? "apprentice" : "expert", text: message });
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > 0.6) watch.markActivity("talking");
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") watch.markActivity("agent");
    },
    onError: (m) => setError(m),
    clientTools: {
      off_the_record: async () => offTheRecordResult(strikeLastMinute()),
      end_task: async () => {
        // Guard against premature calls: the expert must have just said they are done.
        const recent = transcriptRef.current.filter((l) => l.role === "expert").slice(-2).map((l) => l.text).join(" ");
        if (!/done|finish|wrap|that'?s it|all set|complete/i.test(recent)) return "The expert has not said the task is finished. Keep listening.";
        void endTask();
      },
      confirm_teachback: async ({ confirmed, corrections }: { confirmed: boolean; corrections?: string }) => {
        void finalize(Boolean(confirmed), corrections ?? "");
      },
    },
  });
  const convRef = useLatest(conv);

  const watch = useScreenWatch({
    startedAtRef: startedAt,
    onEvents: (evs) => {
      if (phaseRef.current !== "capturing") return;
      unaskedEvents.current.push(...evs);
      if (convRef.current.status === "connected") for (const e of evs) convRef.current.sendContextualUpdate(screenNote(e));
    },
  });

  // Pause gate: WHEN to ask. Idle long enough, agent not speaking, something new to ask about,
  // budget left, spacing respected. Reads live values through refs so the timer is created once.
  const gate = useLatest({ activity: watch.activity, idleMs: watch.idleMs, questions });
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gate.current;
      const c = convRef.current;
      const sinceAsk = Date.now() - lastAsk.current;
      const elapsedMin = Math.max(1, (Date.now() - startedAt.current) / 60_000);
      const budget = Math.ceil((BUDGET_PER_10MIN * elapsedMin) / 10) + 1;
      const waitS = Math.max(0, Math.ceil((MIN_GAP_MS - sinceAsk) / 1000));
      const reason =
        phaseRef.current !== "capturing" || c.status !== "connected"
          ? ""
          : g.activity !== "idle"
            ? `expert is ${g.activity === "agent" ? "listening to me" : g.activity}`
            : c.isSpeaking
              ? "I am speaking"
              : unaskedEvents.current.length === 0
                ? "nothing new on screen"
                : g.questions >= budget
                  ? "question budget used, saving it for the debrief"
                  : waitS > 0
                    ? `spacing: next question in ${waitS}s`
                    : "asking now";
      setGateInfo((prev) => (prev.unasked === unaskedEvents.current.length && prev.waitS === waitS && prev.budget === budget && prev.reason === reason ? prev : { unasked: unaskedEvents.current.length, waitS, budget, reason }));
      if (reason !== "asking now") return;
      const recent = unaskedEvents.current.splice(0).slice(-6);
      lastAsk.current = Date.now();
      c.sendUserMessage(pauseMsg(g.idleMs, recent));
    }, 500);
    return () => window.clearInterval(id);
  }, [gate, convRef, phaseRef]);

  // "Off the record": strike the last minute of screen events and the expert's words.
  function strikeLastMinute() {
    const n = watch.redactSince(60_000);
    const cutoff = now() - 60_000;
    setTranscript((t) => t.map((l) => (l.t >= cutoff && l.role === "expert" ? { ...l, text: "", redacted: true } : l)));
    return n;
  }

  async function connect(prompt: string, firstMessage: string) {
    const err = await connectAgent(conv, { prompt, firstMessage, language: lang });
    if (err) setError(err);
    return !err;
  }

  async function start() {
    setError(null);
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    startedAt.current = Date.now();
    watch.reset();
    setTranscript([]);
    setQuestions(0);
    try {
      const stream = await watch.start();
      recording.current = null;
      recorder.current.start(stream);
    } catch (e) {
      setError(`Screen share: ${String(e)}`);
      return;
    }
    if (await connect(interviewerPrompt(lang), LANGS[lang].greeting)) setPhase("capturing");
  }

  function snapshot(): Session {
    return { id: `s${startedAt.current.toString(36)}`, startedAt: startedAt.current, events: watch.events, frames: watch.frames, transcript: transcriptRef.current, workMap: workMap ?? undefined, recording: recording.current };
  }

  async function endTask() {
    if (phaseRef.current !== "capturing") return;
    setPhase("synthesizing");
    watch.stop();
    recording.current = await recorder.current.stop();
    conv.endSession();
    const data = await postWorkMap({ events: watch.events, transcript: transcriptRef.current, expertName: "the expert" });
    if (!data.ok) {
      setError(data.error);
      setPhase("capturing");
      return;
    }
    setWorkMap(data.workMap);
    await saveSession({ ...snapshot(), workMap: data.workMap });
    debriefStartT.current = now();
    if (await connect(debriefPrompt(data.workMap, lang), LANGS[lang].debriefOpener(data.workMap.openGaps[0] ?? DEFAULT_GAP))) setPhase("debrief");
  }

  async function finalize(confirmed: boolean, corrections: string) {
    if (!workMap) return;
    setPhase("finalizing");
    conv.endSession();
    const all = transcriptRef.current;
    const data = await postWorkMap({
      events: watch.events,
      transcript: all.filter((l) => l.t < debriefStartT.current),
      debrief: all.filter((l) => l.t >= debriefStartT.current),
      previous: workMap,
      expertName: "the expert",
    });
    const withConfirm = { ...(data.ok ? data.workMap : workMap), confirmedByExpert: confirmed, corrections: corrections ? [corrections] : [] };
    setWorkMap(withConfirm);
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    await saveSession({ ...snapshot(), workMap: withConfirm, endedAt: Date.now() });
    setPhase("done");
  }

  function toggleMask() {
    const on = !mask;
    setMask(on);
    iframe.current?.contentWindow?.postMessage({ type: "privacy:mask", on }, "*");
  }

  const connected = conv.status === "connected";
  const pickedFrame = picked ? watch.frames.find((x) => x.id === picked.frameId) : undefined;

  return (
    <div className="grid h-screen grid-cols-[1fr_420px] bg-zinc-950 text-zinc-100">
      <iframe ref={iframe} src="/erp?mode=expert" className="h-full w-full border-0 bg-white" title="ERP sandbox" />

      <aside className="flex h-full flex-col border-l border-white/10 bg-zinc-900">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Orb mode={conv.mode} connected={connected} />
          <div className="flex-1">
            <div className="text-sm font-semibold">AI Apprentice</div>
            <ActivityPill activity={watch.activity} idleMs={watch.idleMs} connected={connected} />
          </div>
          <div className="text-right text-[11px] text-zinc-400">
            <div>{phase}</div>
            <div>
              {questions} asked · {watch.events.length} events
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2">
          {phase === "idle" || phase === "done" ? (
            <button onClick={start} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400">
              Share screen &amp; start
            </button>
          ) : null}
          {phase === "capturing" && (
            <button onClick={endTask} className="rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-400">
              Task done → debrief
            </button>
          )}
          {(phase === "capturing" || phase === "debrief") && (
            <button
              onClick={() => {
                const n = strikeLastMinute();
                if (connected) conv.sendContextualUpdate(struckNote(n));
              }}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
              title="Remove the last 60 s from the record"
            >
              Off the record
            </button>
          )}
          {phase === "idle" && (
            <select value={lang} onChange={(e) => setLang(langOf(e.target.value))} className="rounded-md border border-white/15 bg-zinc-900 px-2 py-1.5 text-sm" title="Language the expert speaks; the Work Map and the tutor stay in English">
              {Object.entries(LANGS).map(([k, v]) => (
                <option key={k} value={k}>
                  Expert speaks {v.name}
                </option>
              ))}
            </select>
          )}
          <SettingsButton />
          <button onClick={toggleMask} className={`rounded-md border px-3 py-1.5 text-sm ${mask ? "border-emerald-400 text-emerald-300" : "border-white/15 hover:bg-white/5"}`}>
            {mask ? "PII masked" : "Mask PII"}
          </button>
          {phase === "done" && (
            <Link href="/map" className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-sky-400">
              Open Work Map →
            </Link>
          )}
        </div>

        {phase === "capturing" && (
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-1.5 font-mono text-[11px] text-zinc-400" title="Pause gate: when the apprentice may speak">
            <span className={gateInfo.reason === "asking now" ? "text-emerald-300" : ""}>gate: {gateInfo.reason || "waiting for connection"}</span>
            <span className="ml-auto">{gateInfo.unasked} unasked · {questions}/{gateInfo.budget} budget</span>
          </div>
        )}
        {error && <div className="mx-4 mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}
        {phase === "synthesizing" && <div className="mx-4 mt-2 text-xs text-zinc-400">Merging {watch.events.length} screen events and the transcript into a Work Map draft…</div>}
        {phase === "finalizing" && <div className="mx-4 mt-2 text-xs text-zinc-400">Folding the debrief into the Work Map…</div>}
        {watch.piiSeen.size > 0 && (
          <div className="mx-4 mt-2 text-[11px] text-amber-300/80">
            Personal data seen on screen ({[...watch.piiSeen].join(", ")}) was masked before it reached the record.
          </div>
        )}

        <section className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div className="mb-1 px-1.5 text-[11px] uppercase tracking-wide text-zinc-500">Screen events</div>
          <EventList events={watch.events} frames={watch.frames} onPick={setPicked} />
          {watch.events.length === 0 && <div className="px-1.5 text-xs text-zinc-500">Share this tab; a frame goes to the vision model whenever the screen changes.</div>}
        </section>

        <section className="max-h-[34%] overflow-y-auto border-t border-white/10 px-3 py-2">
          <div className="mb-1 px-1.5 text-[11px] uppercase tracking-wide text-zinc-500">Conversation</div>
          <Transcript lines={transcript} />
        </section>

        {picked && (
          <div className="absolute bottom-4 right-[436px] w-[520px] rounded-lg border border-white/10 bg-zinc-900 p-2 shadow-2xl" onClick={() => setPicked(null)}>
            {pickedFrame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pickedFrame.dataUrl} alt="" className="w-full rounded" />
            ) : (
              <div className="p-4 text-xs text-zinc-500">No frame for this event</div>
            )}
            <div className="px-1 pt-1 text-xs text-zinc-300">
              {fmtT(picked.t)} · {picked.summary}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function Page() {
  return (
    <ConversationProvider>
      <CapturePage />
    </ConversationProvider>
  );
}
