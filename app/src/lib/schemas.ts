// Domain schemas (Effect Schema). The same definitions drive constrained decoding on the
// server (JSON Schema → Gemini) and typing in the browser.

import { Schema as S } from "effect";

const desc = (d: string) => ({ description: d });

export const EventKind = S.Literals(["open", "change", "save", "hold", "navigate", "note", "other"]);
export type EventKind = typeof EventKind.Type;

// Screen event: what changed on the expert's screen, from the vision model ("vision") or
// mirrored from the sandbox ERP DOM ("dom").
export const ScreenEvent = S.Struct({
  id: S.String,
  t: S.Number.annotate(desc("ms since session start")),
  source: S.Literals(["vision", "dom"]),
  kind: EventKind,
  summary: S.String.annotate(desc("one line, e.g. 'cost center changed from 4711 to 0400 on INV-4471'")),
  invoice: S.optionalKey(S.NullOr(S.String)),
  field: S.optionalKey(S.NullOr(S.String)),
  from: S.optionalKey(S.NullOr(S.String)),
  to: S.optionalKey(S.NullOr(S.String)),
  frameId: S.optionalKey(S.NullOr(S.String)),
  redacted: S.optionalKey(S.Boolean),
});
export type ScreenEvent = typeof ScreenEvent.Type;

// Vision model output for a pair of frames. Cascade: look → decide if changed → list events → PII.
export const VisionResult = S.Struct({
  whatIsOnScreen: S.String.annotate(desc("what the CURRENT frame shows, one line, PII masked")),
  changed: S.Boolean.annotate(desc("true only if something meaningful changed vs PREVIOUS")),
  events: S.Array(
    S.Struct({
      kind: EventKind,
      summary: S.String.annotate(desc("under 20 words, concrete identifiers, PII masked")),
      invoice: S.NullOr(S.String),
      field: S.NullOr(S.String),
      from: S.NullOr(S.String),
      to: S.NullOr(S.String),
    }),
  ),
  piiSeen: S.Array(S.Literals(["PERSON", "EMAIL", "PHONE", "IBAN", "ADDRESS", "OTHER"])).annotate(desc("categories of personal data visible on screen")),
});
export type VisionResult = typeof VisionResult.Type;

export const TranscriptLine = S.Struct({
  t: S.Number,
  role: S.Literals(["expert", "apprentice", "newhire", "tutor", "system"]),
  text: S.String,
  redacted: S.optionalKey(S.Boolean),
});
export type TranscriptLine = typeof TranscriptLine.Type;

const CheckOp = S.Literals(["eq", "neq", "gt", "lt", "empty", "not_empty"]);
const Cond = S.Struct({
  field: S.Literals(["cost_center", "asset_number", "approval", "status", "amount", "supplier", "note"]),
  op: CheckOp,
  value: S.NullOr(S.String).annotate(desc("compare value as string; numbers as digits")),
});

// Machine-checkable guardrail: WHEN precondition holds, the decision MUST satisfy `must`.
// This is the agent-ready export: the tutor evaluates it live before a save.
export const GuardrailCheck = S.Struct({
  when: S.NullOr(Cond).annotate(desc("precondition, e.g. amount gt 5000; null = always")),
  must: Cond.annotate(desc("what must hold, e.g. cost_center eq 0400")),
});
export type GuardrailCheck = typeof GuardrailCheck.Type;

export const Guardrail = S.Struct({
  id: S.String.annotate(desc("G1, G2, ...")),
  kind: S.Literals(["limit", "exception", "stop_and_ask", "never_do"]),
  rule: S.String.annotate(desc("the guardrail in plain words")),
  quote: S.NullOr(S.String).annotate(desc("expert's own words, verbatim from the transcript")),
  stepN: S.NullOr(S.Number),
  frameId: S.NullOr(S.String).annotate(desc("screen moment where it came up")),
  check: S.NullOr(GuardrailCheck).annotate(desc("machine-checkable form if the rule is about ERP fields, else null")),
});
export type Guardrail = typeof Guardrail.Type;

export const WorkMapStep = S.Struct({
  n: S.Number,
  title: S.String.annotate(desc("imperative, e.g. 'Code the invoice to a cost center'")),
  screenMoment: S.Struct({
    t: S.Number.annotate(desc("ms, from the matching screen event")),
    frameId: S.NullOr(S.String).annotate(desc("frameId of the matching screen event")),
    caption: S.String,
  }),
  decision: S.String.annotate(desc("what the expert did, concrete")),
  reason: S.Struct({
    quote: S.String.annotate(desc("expert's own words, verbatim; empty string if they never said")),
    source: S.Literals(["live", "debrief", "inferred"]),
    t: S.NullOr(S.Number),
  }),
  guardrailIds: S.Array(S.String),
  isJudgmentCall: S.Boolean.annotate(desc("true if a new hire could reasonably have decided differently")),
  redacted: S.optionalKey(S.Boolean),
});
export type WorkMapStep = typeof WorkMapStep.Type;

export const WorkMap = S.Struct({
  title: S.String,
  summary: S.String.annotate(desc("the whole process in under 120 words, in the expert's voice, for the teach-back")),
  steps: S.Array(WorkMapStep),
  guardrails: S.Array(Guardrail),
  openGaps: S.Array(S.String).annotate(desc("questions still unanswered, phrased as the apprentice would ask them")),
  confirmedByExpert: S.optionalKey(S.Boolean),
  corrections: S.optionalKey(S.Array(S.String)),
});
export type WorkMap = typeof WorkMap.Type;

export const MasteryItem = S.Struct({
  stepN: S.Number,
  result: S.Literals(["mastered", "practice"]),
  note: S.String,
});
export type MasteryItem = typeof MasteryItem.Type;
