import Link from "next/link";

// One screen for the technical walkthrough video: data flow and the five Apprentice Test answers.

const flow = [
  { n: "1", title: "Screen → events", body: "getDisplayMedia frame every 1.5 s. Coarse 64×36 grayscale diff; only frames that changed ≥1.2 % go to Gemini 3.5 Flash with the previous frame. The model returns events, not video, with PII already replaced ([PERSON], [IBAN]). The sandbox ERP mirrors its own field changes as 'app' events; duplicates within 6 s are merged." },
  { n: "2", title: "When to ask: pause gate", body: "Client-side, 500 ms tick. Speak only if: no keys/mouse for 3 s, no user speech (VAD), agent not speaking, ≥40 s since the last question, something new on screen since then, and budget left (3–5 per 10 min). Then one [PAUSE] message with the unasked events. The agent may still call skip_turn." },
  { n: "3", title: "What to ask: the agent", body: "One ElevenLabs agent (Expressive Mode, patient turn-taking) plays three roles through per-session prompt overrides. Screen events arrive as contextual updates it must not answer. The interviewer prompt forbids questions the screen answers and ranks reason > limit > exception > stop-and-ask. Client tools: off_the_record, end_task." },
  { n: "4", title: "Map: Schema-Guided Reasoning", body: "Events + transcript → one constrained-decoding call whose schema is the expert's checklist in order: observations → step boundaries → candidate quotes → guardrail evidence → Work Map (steps, guardrails with machine-checkable when→must, open gaps, teach-back). Effect Schema → JSON Schema → Gemini; Effect pipeline for retry, timeout, typed errors." },
  { n: "5", title: "When it has understood: debrief", body: "Open gaps become the debrief prompt. ≥3 gaps answered → teach-back under 60 s → expert corrects or confirms → confirm_teachback(corrections) → the debrief transcript is folded back into the map (second synthesis pass). Only then is the map marked confirmed." },
  { n: "6", title: "Teach: guardrails before the save", body: "The tutor gets the Work Map as its prompt. The same guardrail JSON runs as a checker on the new hire's ERP state: a violated rule on a field change or save attempt pauses the save, sends [GUARDRAIL] to the tutor, which steps in, calls replay_moment (the expert's frame + quote) and record_mastery. Export: agent-guardrails.json." },
];

const trust = [
  ["Off the record", "Tool and button strike the last 60 s of transcript and events; the agent acknowledges and never repeats it. Redacted steps stay generic in the map."],
  ["PII on screen", "Vision prompt returns [PERSON]/[EMAIL]/[IBAN]; categories seen are shown to the expert. On-screen mask toggle blurs contact and IBAN before frames are captured."],
  ["Data stays local", "Frames and the session live in the browser (IndexedDB). Only the diffed JPEG pairs go to the vision model; audio goes to ElevenLabs."],
];

export default function Architecture() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Home</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">How the apprentice works</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">One Next.js app. Browser does capture and timing; the server does structured reasoning; ElevenLabs does the conversation.</p>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {flow.map((f) => (
            <section key={f.n} className="rounded-xl border border-white/10 bg-zinc-900 p-5">
              <div className="flex items-baseline gap-3">
                <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-xs text-sky-300">{f.n}</span>
                <h2 className="text-lg font-medium">{f.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{f.body}</p>
            </section>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold">Trust</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {trust.map(([t, b]) => (
            <section key={t} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="font-medium text-amber-200">{t}</div>
              <p className="mt-1 text-sm text-zinc-300">{b}</p>
            </section>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold">Stack</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-300">{`browser   getDisplayMedia → canvas diff → /api/vision        @elevenlabs/react (WebSocket, client tools, overrides)
server    Effect 4 pipeline: llm.ts (Schema → JSON Schema → Gemini, retry/timeout) · vision.ts · workmap.ts (SGR cascade)
agent     ElevenLabs Agents · eleven_v3_conversational, Expressive Mode · turn: patient, 30 s · skip_turn system tool
data      IndexedDB session (events, frames, transcript, Work Map, mastery) · export: work-map.json, agent-guardrails.json
repo      github.com/fortunto2/ai-apprentice · live: ai-apprentice-nu.vercel.app`}</pre>
      </div>
    </main>
  );
}
