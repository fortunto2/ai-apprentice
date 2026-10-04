"use client";

// Module 1 + 2: the expert works in the sandbox ERP (iframe, left) while the apprentice watches
// the shared screen and listens (right). Pause gate decides WHEN to ask; the agent decides WHAT.
// "End task" → Work Map draft → spoken debrief → teach-back → confirmed Work Map.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ActivityPill, EventList, Orb, Transcript } from "@/components/panel";
import { LANG_NAMES, debriefPrompt, interviewerPrompt } from "@/lib/prompts";
import type { ScreenEvent, TranscriptLine, WorkMap } from "@/lib/schemas";
import { fmtT, saveSession, type Session } from "@/lib/session-store";
import { useScreenWatch } from "@/lib/use-screen-watch";

type Phase = "idle" | "capturing" | "synthesizing" | "debrief" | "finalizing" | "done";

const MIN_GAP_MS = 40_000; // between questions
const BUDGET_PER_10MIN = 5;
const GREETING: Record<string, string> = {
  en: "Hi, I'm your apprentice today. I'll watch and stay quiet while you work. Go ahead whenever you're ready.",
  ru: "Привет, я сегодня ваш ученик. Буду смотреть и молчать, пока вы работаете. Начинайте, когда будете готовы.",
  de: "Hallo, ich bin heute Ihr Lehrling. Ich schaue zu und bleibe still, während Sie arbeiten. Fangen Sie an, wann Sie möchten.",
};

function CapturePage() {
  const startedAt = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const [questions, setQuestions] = useState(0);
  const [mask, setMask] = useState(false);
  const [lang, setLang] = useState<"en" | "ru" | "de">("en");
  const [workMap, setWorkMap] = useState<WorkMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScreenEvent | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const lastAsk = useRef(0);
  const unaskedEvents = useRef<ScreenEvent[]>([]);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const debriefStartT = useRef(0);

  const now = () => Date.now() - startedAt.current;

  const pushLine = useCallback((l: TranscriptLine) => {
    transcriptRef.current = [...transcriptRef.current, l];
    setTranscript(transcriptRef.current);
  }, []);

  const conv = useConversation({
    onMessage: ({ message, source }) => {
      if (!message?.trim()) return;
      if (source === "ai") {
        if (phaseRef.current === "capturing") setQuestions((q) => q + 1);
        pushLine({ t: now(), role: "apprentice", text: message });
      } else {
        pushLine({ t: now(), role: "expert", text: message });
      }
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore > 0.6) watch.markActivity("talking");
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") watch.markActivity("agent");
    },
    onError: (m) => setError(m),
    clientTools: {
      off_the_record: async () => {
        const n = watch.redactSince(60_000);
        const cutoff = now() - 60_000;
        transcriptRef.current = transcriptRef.current.map((l) => (l.t >= cutoff && l.role === "expert" ? { ...l, text: "", redacted: true } : l));
        setTranscript(transcriptRef.current);
        return `Removed ${n} screen events and the last minute of the expert's words from the record.`;
      },
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

  const watch = useScreenWatch({
    startedAtRef: startedAt,
    onEvents: (evs) => {
      if (phaseRef.current !== "capturing") return;
      unaskedEvents.current.push(...evs);
      if (conv.status === "connected") {
        for (const e of evs) conv.sendContextualUpdate(`[SCREEN] ${fmtT(e.t)} ${e.summary}`);
      }
    },
  });

  // Pause gate: WHEN to ask. Idle long enough, agent not speaking, something new to ask about,
  // budget left, spacing respected. Reads live values through refs so the timer is created once.
  const gate = useRef({ activity: watch.activity, idleMs: watch.idleMs, questions, status: conv.status, isSpeaking: conv.isSpeaking });
  useEffect(() => {
    gate.current = { activity: watch.activity, idleMs: watch.idleMs, questions, status: conv.status, isSpeaking: conv.isSpeaking };
  });
  const convRef = useRef(conv);
  useEffect(() => {
    convRef.current = conv;
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gate.current;
      if (phaseRef.current !== "capturing" || g.status !== "connected") return;
      if (g.activity !== "idle" || g.isSpeaking) return;
      const sinceAsk = Date.now() - lastAsk.current;
      const elapsedMin = Math.max(1, (Date.now() - startedAt.current) / 60_000);
      const budget = Math.ceil((BUDGET_PER_10MIN * elapsedMin) / 10) + 1;
      if (sinceAsk < MIN_GAP_MS || unaskedEvents.current.length === 0 || g.questions >= budget) return;
      const recent = unaskedEvents.current.slice(-6).map((e) => `- ${fmtT(e.t)} ${e.summary}`).join("\n");
      unaskedEvents.current = [];
      lastAsk.current = Date.now();
      convRef.current.sendUserMessage(`[PAUSE] The expert has been idle for ${Math.round(g.idleMs / 1000)} s. Recent screen events:\n${recent}\nAsk ONE short question about a reason or a guardrail behind these, or call skip_turn.`);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  async function start() {
    setError(null);
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    startedAt.current = Date.now();
    watch.reset();
    transcriptRef.current = [];
    setTranscript([]);
    setQuestions(0);
    try {
      await watch.start();
    } catch (e) {
      setError(`Screen share: ${String(e)}`);
      return;
    }
    await connect(interviewerPrompt(lang), GREETING[lang]);
    setPhase("capturing");
  }

  async function connect(prompt: string, firstMessage: string) {
    for (let i = 0; i < 20 && conv.status !== "disconnected"; i++) await new Promise((r) => setTimeout(r, 250));
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
      overrides: { agent: { prompt: { prompt }, firstMessage, language: lang } },
    });
  }

  function snapshot(): Session {
    return {
      id: `s${startedAt.current.toString(36)}`,
      startedAt: startedAt.current,
      events: watch.events,
      frames: watch.frames,
      transcript: transcriptRef.current,
      workMap: workMap ?? undefined,
    };
  }

  async function endTask() {
    if (phaseRef.current !== "capturing") return;
    setPhase("synthesizing");
    watch.stop();
    conv.endSession();
    const taskTranscript = transcriptRef.current;
    const res = await fetch("/api/workmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: watch.events, transcript: taskTranscript, expertName: "the expert" }),
    });
    const data = (await res.json()) as { ok: true; workMap: WorkMap } | { ok: false; error: string };
    if (!data.ok) {
      setError(data.error);
      setPhase("capturing");
      return;
    }
    setWorkMap(data.workMap);
    await saveSession({ ...snapshot(), workMap: data.workMap });
    debriefStartT.current = now();
    const gap0 = data.workMap.openGaps[0] ?? "which of these steps would a new hire most likely get wrong?";
    await connect(debriefPrompt(data.workMap, lang), lang === "en" ? `Thanks, the task is done. Let me close a few gaps before I explain it back. First: ${gap0}` : lang === "ru" ? `Спасибо, задача закончена. Закрою несколько пробелов, прежде чем пересказать. Первый вопрос: ${gap0}` : `Danke, die Aufgabe ist erledigt. Ich schließe ein paar Lücken, bevor ich es zurückerkläre. Erste Frage: ${gap0}`);
    setPhase("debrief");
  }

  async function finalize(confirmed: boolean, corrections: string) {
    if (!workMap) return;
    setPhase("finalizing");
    conv.endSession();
    const debrief = transcriptRef.current.filter((l) => l.t >= debriefStartT.current);
    const task = transcriptRef.current.filter((l) => l.t < debriefStartT.current);
    const res = await fetch("/api/workmap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: watch.events, transcript: task, debrief, previous: workMap, expertName: "the expert" }),
    });
    const data = (await res.json()) as { ok: true; workMap: WorkMap } | { ok: false; error: string };
    const finalMap: WorkMap = data.ok ? data.workMap : workMap;
    const withConfirm = { ...finalMap, confirmedByExpert: confirmed, corrections: corrections ? [corrections] : [] };
    setWorkMap(withConfirm);
    await saveSession({ ...snapshot(), workMap: withConfirm, endedAt: Date.now() });
    setPhase("done");
  }

  function toggleMask() {
    const on = !mask;
    setMask(on);
    iframe.current?.contentWindow?.postMessage({ type: "privacy:mask", on }, "*");
  }

  const connected = conv.status === "connected";

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
                const n = watch.redactSince(60_000);
                const cutoff = now() - 60_000;
                transcriptRef.current = transcriptRef.current.map((l) => (l.t >= cutoff && l.role === "expert" ? { ...l, text: "", redacted: true } : l));
                setTranscript(transcriptRef.current);
                if (connected) conv.sendContextualUpdate(`[SYSTEM] The expert struck the last minute from the record (${n} events). Do not refer to it.`);
              }}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
              title="Remove the last 60 s from the record"
            >
              Off the record
            </button>
          )}
          {phase === "idle" && (
            <select value={lang} onChange={(e) => setLang(e.target.value as "en" | "ru" | "de")} className="rounded-md border border-white/15 bg-zinc-900 px-2 py-1.5 text-sm" title="Language the expert speaks; the Work Map and the tutor stay in English">
              {Object.entries(LANG_NAMES).map(([k, v]) => (
                <option key={k} value={k}>
                  Expert speaks {v}
                </option>
              ))}
            </select>
          )}
          <button onClick={toggleMask} className={`rounded-md border px-3 py-1.5 text-sm ${mask ? "border-emerald-400 text-emerald-300" : "border-white/15 hover:bg-white/5"}`}>
            {mask ? "PII masked" : "Mask PII"}
          </button>
          {phase === "done" && (
            <Link href="/map" className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-sky-400">
              Open Work Map →
            </Link>
          )}
        </div>

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
            {(() => {
              const f = watch.frames.find((x) => x.id === picked.frameId);
              // eslint-disable-next-line @next/next/no-img-element
              return f ? <img src={f.dataUrl} alt="" className="w-full rounded" /> : <div className="p-4 text-xs text-zinc-500">No frame for this event</div>;
            })()}
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
