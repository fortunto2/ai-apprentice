// Evaluates machine-checkable guardrails (from the Work Map) against the ERP state.
// This is the "agent-ready guardrails" export in action: the same JSON an agent would load.

import type { ErpState } from "./erp-bridge.ts";
import type { Guardrail, GuardrailCheck } from "./schemas.ts";

type Cond = GuardrailCheck["must"];

const norm = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "hold" || s === "held" || s === "on hold") return "held";
  if (s === "approve" || s === "approved" || s === "saved") return "approved";
  return s;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function holds(c: Cond, st: ErpState): boolean {
  const actual = st[c.field as keyof ErpState];
  switch (c.op) {
    case "empty":
      return norm(actual) === "";
    case "not_empty":
      return norm(actual) !== "";
    case "eq":
      return norm(actual) === norm(c.value) || (c.field === "supplier" && norm(actual).includes(norm(c.value).split(" ")[0]));
    case "neq":
      return norm(actual) !== norm(c.value);
    case "gt": {
      const a = num(actual), b = num(c.value);
      return a !== null && b !== null && a > b;
    }
    case "lt": {
      const a = num(actual), b = num(c.value);
      return a !== null && b !== null && a < b;
    }
  }
}

export type Violation = { guardrail: Guardrail; expected: Cond };

// `atSave`: status-type rules (hold / second approval before saving) only make sense when the
// user tries to save; field rules (cost center, asset number) can be caught as soon as they change.
export function violations(guardrails: ReadonlyArray<Guardrail>, st: ErpState, atSave: boolean): Violation[] {
  const out: Violation[] = [];
  for (const g of guardrails) {
    if (!g.check) continue;
    const { when, must } = g.check;
    if (must.field === "status" && !atSave) continue;
    if (when && !holds(when, st)) continue;
    if (!holds(must, st)) out.push({ guardrail: g, expected: must });
  }
  return out;
}

export function describeCond(c: Cond) {
  const f = c.field.replace("_", " ");
  switch (c.op) {
    case "empty":
      return `${f} is empty`;
    case "not_empty":
      return `${f} is filled in`;
    case "eq":
      return `${f} = ${c.value}`;
    case "neq":
      return `${f} ≠ ${c.value}`;
    case "gt":
      return `${f} > ${c.value}`;
    case "lt":
      return `${f} < ${c.value}`;
  }
}

// Export for agents: the rules an automation would load to stop where the expert would.
export function exportAgentGuardrails(guardrails: ReadonlyArray<Guardrail>, title: string) {
  return {
    workflow: title,
    format: "ai-apprentice/guardrails@1",
    rules: guardrails.map((g) => ({
      id: g.id,
      kind: g.kind,
      rule: g.rule,
      expert_said: g.quote,
      check: g.check,
      on_violation: g.kind === "stop_and_ask" ? "stop_and_ask_human" : "block_and_explain",
    })),
  };
}
