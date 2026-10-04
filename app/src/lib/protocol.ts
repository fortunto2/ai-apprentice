// The messages the app sends to the agent ([SCREEN], [PAUSE], [PREDICT], [GUARDRAIL], ...), the
// greetings per role, and the tool results. One module, used by the pages and by scripts/eval.ts,
// so the eval exercises the same strings the UI sends.

import type { ErpState } from "./erp-bridge.ts";
import type { Violation } from "./guardrails.ts";
import { describeCond } from "./guardrails.ts";
import type { ScreenEvent, WorkMap, WorkMapStep } from "./schemas.ts";
import { fmtT } from "./time.ts";

export const LANGS = {
  en: {
    name: "English",
    greeting: "Hi, I'm your apprentice today. I'll watch and stay quiet while you work. Go ahead whenever you're ready.",
    debriefOpener: (gap: string) => `Thanks, the task is done. Let me close a few gaps before I explain it back. First: ${gap}`,
  },
  ru: {
    name: "Russian",
    greeting: "Привет, я сегодня ваш ученик. Буду смотреть и молчать, пока вы работаете. Начинайте, когда будете готовы.",
    debriefOpener: (gap: string) => `Спасибо, задача закончена. Закрою несколько пробелов, прежде чем пересказать. Первый вопрос: ${gap}`,
  },
  de: {
    name: "German",
    greeting: "Hallo, ich bin heute Ihr Lehrling. Ich schaue zu und bleibe still, während Sie arbeiten. Fangen Sie an, wann Sie möchten.",
    debriefOpener: (gap: string) => `Danke, die Aufgabe ist erledigt. Ich schließe ein paar Lücken, bevor ich es zurückerkläre. Erste Frage: ${gap}`,
  },
} as const;
export type Lang = keyof typeof LANGS;
export const langOf = (s: string | undefined): Lang => (s && s in LANGS ? (s as Lang) : "en");

export const TUTOR_GREETING = "Hi, I'm your tutor today. I learned this job from Sabine, so I'll coach you the way she thinks. Open the first invoice whenever you're ready, and tell me what you see.";
export const DEFAULT_GAP = "which of these steps would a new hire most likely get wrong?";

export const screenNote = (e: Pick<ScreenEvent, "t" | "summary">) => `[SCREEN] ${fmtT(e.t)} ${e.summary}`;

export const pauseMsg = (idleMs: number, recent: ReadonlyArray<Pick<ScreenEvent, "t" | "summary">>) =>
  `[PAUSE] The expert has been idle for ${Math.round(idleMs / 1000)} s. Recent screen events:\n${recent.map((e) => `- ${fmtT(e.t)} ${e.summary}`).join("\n") || "(nothing new)"}\nAsk ONE short question about a reason or a guardrail behind these, or call skip_turn.`;

export const struckNote = (n: number) => `[SYSTEM] The expert struck the last minute from the record (${n} events). Do not refer to it.`;
export const offTheRecordResult = (n: number) => `Removed ${n} screen events and the last minute of the expert's words from the record.`;

const stateLine = (st: ErpState) => `cost center ${st.cost_center}, asset ${st.asset_number || "none"}, approval ${st.approval}, status ${st.status}`;

export const openedMsg = (summary: string) => `[SCREEN] ${summary}. Orient the new hire in one sentence (what this case is, what to look at), do not reveal the decision.`;
export const matchesNote = (summary: string) => `[SCREEN] ${summary}. This matches the expert's rules so far.`;
export const stillViolatesNote = (v: Violation, st: ErpState) => `[SCREEN] ${st.invoice} still violates ${v.guardrail.id} (${describeCond(v.expected)}).`;

export const predictMsg = (invoice: string, st: ErpState | null) =>
  `[PREDICT] The new hire has been looking at ${invoice}${st ? ` (${st.supplier}, €${st.amount}, cost center ${st.cost_center}, approval ${st.approval})` : ""} for a few seconds without changing anything. Ask them to predict what the expert would do with this one and why. One question.`;

export const stepForGuardrail = (map: WorkMap, gid: string) =>
  map.guardrails.find((g) => g.id === gid)?.stepN ?? map.steps.find((s) => s.guardrailIds.includes(gid))?.n ?? 1;

export const guardrailMsg = (v: Violation, st: ErpState, atSave: boolean, stepN: number) =>
  `[GUARDRAIL] ${atSave ? "The new hire is about to SAVE" : "The new hire just set"} ${st.invoice} (${st.supplier}, €${st.amount}) with ${stateLine(st)}. This breaks guardrail ${v.guardrail.id}: ${v.guardrail.rule} (expected ${describeCond(v.expected)}). The expert's words: "${v.guardrail.quote ?? ""}". Step in now: say the expert would stop here and ask why they think so, then call replay_moment with step ${stepN}, explain the rule in the expert's words, and say what to change. ${atSave ? "The save is paused until they fix it." : ""}`;

export const saveOkMsg = (st: ErpState) =>
  `[SCREEN] The new hire is saving ${st.invoice} with ${stateLine(st)}. This satisfies all guardrails. Confirm in one sentence using the expert's reason, and call record_mastery for the matching step with result "mastered".`;

export const replayResult = (s: WorkMapStep | undefined) =>
  s ? `Showing the expert's screen moment for step ${s.n} (${fmtT(s.screenMoment.t)}: ${s.screenMoment.caption}). Expert said: "${s.reason.quote}"` : "No such step.";
