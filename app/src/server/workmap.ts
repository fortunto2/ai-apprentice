// Work Map synthesis as a Schema-Guided Reasoning cascade.
//
// Reasoning cascade (the expert's mental checklist, in order):
//   1. Segment: which screen events belong to one step?            → steps with screen moments
//   2. Attribute: which transcript line explains each step (why)?  → reason quotes, live/debrief/inferred
//   3. Extract guardrails: limits, exceptions, stop-and-ask, never → guardrails, linked to steps + moments
//   4. Judge: which steps are judgment calls vs routine?           → isJudgmentCall
//   5. Gaps: what would a new hire still not know?                 → openGaps (feed the debrief)
//   6. Teach-back text, written last, from everything above.      → summary
// The schema field order enforces this order during constrained decoding.

import { Effect, Schema as S } from "effect";
import { SYNTH_MODEL, generateStructured } from "./llm";
import { ScreenEvent, TranscriptLine, WorkMap } from "@/lib/schemas";

// Analysis cascade: reason first, then emit the Work Map. One call, no prompt chain.
export const WorkMapAnalysis = S.Struct({
  observations: S.String.annotate({ description: "2-4 sentences: what task the expert did, how many records, what stood out" }),
  stepBoundaries: S.Array(
    S.Struct({
      stepN: S.Number,
      firstEventId: S.String,
      lastEventId: S.String,
      whyOneStep: S.String,
    }),
  ).annotate({ description: "segment the events into 4-9 steps before writing them up" }),
  quotesConsidered: S.Array(
    S.Struct({ stepN: S.Number, transcriptT: S.Number, quote: S.String, isReason: S.Boolean }),
  ).annotate({ description: "candidate expert quotes per step; isReason=true if it explains WHY" }),
  guardrailEvidence: S.Array(
    S.Struct({ quote: S.String, kind: S.Literals(["limit", "exception", "stop_and_ask", "never_do"]), aboutStepN: S.NullOr(S.Number) }),
  ),
  workMap: WorkMap,
});
export type WorkMapAnalysis = typeof WorkMapAnalysis.Type;

const SYSTEM = `You are the AI Apprentice's memory. You turn a captured expert session into a Work Map: the process as the expert actually does it, with the reasons in the expert's OWN words and the guardrails they follow.

Inputs: SCREEN EVENTS (timestamped, from a vision model and the app), TRANSCRIPT (expert and apprentice speech, timestamped), and optionally a DEBRIEF transcript and a PREVIOUS DRAFT.

Rules:
- Steps follow the screen. Every step has a screen moment: copy t and frameId from the event that best shows it. Never invent frameIds.
- Reasons are quotes. Use the expert's words verbatim from the transcript (light trimming is fine). If the expert never explained a step, quote="" and source="inferred"; such steps become openGaps.
- Guardrails are the gold: amounts/limits, exceptions ("every December"), when to stop and ask someone, what they would never do. Each one gets a quote and, when it is about ERP fields, a machine-checkable check (fields: cost_center, asset_number, approval, status, amount, supplier, note; values as strings).
- Lines marked [REDACTED] or events with redacted=true: do not use their content anywhere. If a step was redacted, set redacted=true and keep its decision generic.
- openGaps: 3-6 questions a careful apprentice would still ask, each about a specific step or rule, not generic. After a debrief, keep only gaps that remain truly unanswered.
- summary: how the expert would explain the whole job to a new colleague in under 120 words, first person plural avoided, their words where possible. This is read aloud as the teach-back.
- Keep everything in English even if the expert spoke another language: translate quotes faithfully and append the original in parentheses when it is short. The tutor who reads this teaches in English.`;

export function synthesizeWorkMap(input: {
  events: ReadonlyArray<ScreenEvent>;
  transcript: ReadonlyArray<TranscriptLine>;
  debrief?: ReadonlyArray<TranscriptLine>;
  previous?: WorkMap;
  expertName?: string;
}) {
  const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const events = input.events
    .map((e) => `${fmt(e.t)} t=${e.t} id=${e.id} frame=${e.frameId ?? "-"} [${e.source}/${e.kind}] ${e.redacted ? "[REDACTED]" : e.summary}`)
    .join("\n");
  const lines = (tr: ReadonlyArray<TranscriptLine>) =>
    tr.map((l) => `${fmt(l.t)} t=${l.t} ${l.role.toUpperCase()}: ${l.redacted ? "[REDACTED]" : l.text}`).join("\n");

  const parts = [
    { text: `EXPERT: ${input.expertName ?? "the expert"}\n\nSCREEN EVENTS:\n${events || "(none)"}` },
    { text: `TRANSCRIPT (task):\n${lines(input.transcript) || "(none)"}` },
  ];
  if (input.previous) parts.push({ text: `PREVIOUS DRAFT (Work Map JSON):\n${JSON.stringify(input.previous)}` });
  if (input.debrief) parts.push({ text: `DEBRIEF TRANSCRIPT (answers to the open gaps and the teach-back):\n${lines(input.debrief)}` });

  return generateStructured({
    stage: "workmap",
    model: SYNTH_MODEL,
    schema: WorkMapAnalysis,
    system: SYSTEM,
    parts,
    temperature: 0.2,
    timeoutMs: 60_000,
  }).pipe(Effect.map((a) => a.workMap));
}
