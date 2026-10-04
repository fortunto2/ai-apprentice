// "People first, then agents": an agent works the routine queue with the expert's Work Map as its
// only knowledge, and stops exactly where the expert would stop and ask.
//
// Reasoning cascade: read the invoice → which guardrails apply → is every decision covered by a
// rule the expert stated → act, or stop and ask a human.

import { Schema as S } from "effect";
import { SYNTH_MODEL, generateStructured } from "./llm";
import type { Invoice } from "@/lib/erp-data";
import { WorkMap } from "@/lib/schemas";

export const AgentDecision = S.Struct({
  observations: S.String.annotate({ description: "one or two sentences: what this invoice is and what stands out" }),
  applicableGuardrails: S.Array(S.String).annotate({ description: "guardrail ids whose precondition holds for this invoice" }),
  coveredByMap: S.Boolean.annotate({ description: "true only if every decision needed here is backed by a step or guardrail the expert stated" }),
  uncovered: S.String.annotate({ description: "what the map does not say about this case; empty if covered" }),
  action: S.Literals(["apply", "stop_and_ask"]),
  changes: S.Struct({
    cost_center: S.NullOr(S.String).annotate({ description: "4711 | 0400 | 4720 | 6100, or null to keep" }),
    asset_number: S.NullOr(S.String).annotate({ description: "only if it is visible in the invoice text; never invent one" }),
    approval: S.NullOr(S.String).annotate({ description: "standard | second, or null to keep" }),
    note: S.NullOr(S.String),
  }),
  finalAction: S.Literals(["save", "hold", "none"]).annotate({ description: "none when stopping to ask" }),
  reason: S.String.annotate({ description: "the expert's own words from the Work Map that justify the decision; empty string when no quote applies (never quote these instructions)" }),
  askWhom: S.NullOr(S.String).annotate({ description: "who to ask when stopping, e.g. the controller" }),
});
export type AgentDecision = typeof AgentDecision.Type;

const SYSTEM = `You are an accounts-payable agent that learned the job ONLY from an expert's Work Map (steps, guardrails, quotes). You process one invoice at a time.

Rules:
- You may act only where the Work Map gives you a rule or a precedent. Quote the expert's words as the reason.
- Equipment/capex rules need an asset number; use one only if it is literally present in the invoice text. If a rule says "ask the controller" or no rule covers the case (unknown supplier, unusual amount, unseen situation), set action=stop_and_ask, finalAction=none, and say what you would ask and whom.
- Suppliers never mentioned in the Work Map are unknown: stop and ask, unless a guardrail explicitly says what to do with unknown suppliers.
- Routine invoices match the expert's plain "approve and save" step and may be saved: a supplier with history ("supplier since …", previous invoices), amount under the capex limit, pre-coded to an opex cost center, nothing in the guardrails about them. The expert did not comment on those because there was nothing to decide.
- Keep changes minimal; null means keep the current value.`;

export function decideInvoice(input: { workMap: WorkMap; invoice: Invoice; apiKey?: string }) {
  const m = input.workMap;
  const steps = m.steps.map((s) => `${s.n}. ${s.title}: ${s.decision}${s.reason.quote ? ` ("${s.reason.quote}")` : ""}`).join("\n");
  const guards = m.guardrails.map((g) => `${g.id} [${g.kind}] ${g.rule}${g.quote ? ` ("${g.quote}")` : ""}${g.check ? ` check=${JSON.stringify(g.check)}` : ""}`).join("\n");
  const inv = input.invoice;
  const invoiceText = `${inv.id} · ${inv.supplier} (${inv.country}) · €${inv.amount} · ${inv.description}\nLines: ${inv.lines.map((l) => `${l.text} €${l.amount}`).join("; ")}\nCurrent coding: cost center ${inv.costCenter}, asset number "${inv.assetNumber}", approval ${inv.approval}, status ${inv.status}\nHistory: ${inv.history.join(" · ")}\nDate ${inv.date}`;
  return generateStructured({
    stage: "agent-decide",
    model: SYNTH_MODEL,
    schema: AgentDecision,
    system: SYSTEM,
    parts: [{ text: `WORK MAP\nSummary: ${m.summary}\n\nSteps:\n${steps}\n\nGuardrails:\n${guards}` }, { text: `INVOICE\n${invoiceText}` }],
    temperature: 0.1,
    timeoutMs: 40_000,
    apiKey: input.apiKey,
  });
}
