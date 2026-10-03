// A Work Map produced by the pipeline from a scripted session (see docs/demo-script.md).
// Used as a fallback so Map and Teach can be shown without a fresh capture.

import type { WorkMap } from "./schemas";

export const DEMO_WORKMAP: WorkMap = {
  title: "Invoice coding and approval, month-end close",
  summary:
    "Equipment over five thousand euros is always capex, cost center 0400, and it needs an asset number; no asset number, no capex booking, ask the controller. Schwarz double-bills every December, so the December freight invoice is held until it is compared with November. Anything from the Czech subsidiary goes to the controller for a second approval because it has to match on their side. Everything else is coded as pre-filled and saved.",
  steps: [
    { n: 1, title: "Open the invoice and check amount and supplier", screenMoment: { t: 5000, frameId: null, caption: "INV-4471, Müller Maschinenbau, €7,850, hydraulic press" }, decision: "Opened INV-4471 and read it as an equipment purchase", reason: { quote: "", source: "inferred", t: null }, guardrailIds: [], isJudgmentCall: false },
    { n: 2, title: "Code equipment over €5,000 to capex", screenMoment: { t: 21000, frameId: null, caption: "Cost center field, 4711 → 0400" }, decision: "Re-coded from opex (4711) to capex (0400)", reason: { quote: "Equipment over five thousand euros is always capex. Below that it stays opex, nobody cares.", source: "live", t: 27000 }, guardrailIds: ["G1"], isJudgmentCall: true },
    { n: 3, title: "Enter the asset number for the capex booking", screenMoment: { t: 40000, frameId: null, caption: "Asset number AN-2026-0187 entered" }, decision: "Entered asset number AN-2026-0187", reason: { quote: "No asset number, no capex booking. If I cannot find one I ask the controller before I save.", source: "live", t: 45000 }, guardrailIds: ["G2"], isJudgmentCall: false },
    { n: 4, title: "Approve and save", screenMoment: { t: 52000, frameId: null, caption: "INV-4471 saved, status approved" }, decision: "Saved with standard approval", reason: { quote: "", source: "inferred", t: null }, guardrailIds: [], isJudgmentCall: false },
    { n: 5, title: "Hold the December invoice from a double-billing supplier", screenMoment: { t: 95000, frameId: null, caption: "INV-4472 Schwarz Logistik on hold" }, decision: "Put INV-4472 on hold with note 'check against Nov invoice'", reason: { quote: "Schwarz double-bills every December, they send the November freight again. I hold it until I have compared it to the November invoice.", source: "live", t: 101000 }, guardrailIds: ["G3"], isJudgmentCall: true },
    { n: 6, title: "Route the subsidiary invoice for a second approval", screenMoment: { t: 130000, frameId: null, caption: "INV-4473 approval → second (controller)" }, decision: "Changed approval from standard to second and saved", reason: { quote: "Anything from the Czech subsidiary goes to the controller too, intercompany, it has to match on their side.", source: "live", t: 136000 }, guardrailIds: ["G4"], isJudgmentCall: true },
  ],
  guardrails: [
    { id: "G1", kind: "limit", rule: "Equipment over €5,000 is always capex (cost center 0400).", quote: "Equipment over five thousand euros is always capex.", stepN: 2, frameId: null, check: { when: { field: "amount", op: "gt", value: "5000" }, must: { field: "cost_center", op: "eq", value: "0400" } } },
    { id: "G2", kind: "stop_and_ask", rule: "No asset number, no capex booking. Ask the controller if none can be found.", quote: "No asset number, no capex booking. If I cannot find one I ask the controller before I save.", stepN: 3, frameId: null, check: { when: { field: "cost_center", op: "eq", value: "0400" }, must: { field: "asset_number", op: "not_empty", value: null } } },
    { id: "G3", kind: "exception", rule: "Schwarz Logistik double-bills every December: hold the December invoice until compared with November.", quote: "Schwarz double-bills every December, they send the November freight again.", stepN: 5, frameId: null, check: { when: { field: "supplier", op: "eq", value: "Schwarz Logistik KG" }, must: { field: "status", op: "eq", value: "held" } } },
    { id: "G4", kind: "limit", rule: "Invoices from the Czech subsidiary need a second approval by the controller.", quote: "Anything from the Czech subsidiary goes to the controller too.", stepN: 6, frameId: null, check: { when: { field: "supplier", op: "eq", value: "Novák Strojírna s.r.o." }, must: { field: "approval", op: "eq", value: "second" } } },
  ],
  openGaps: [],
  confirmedByExpert: true,
  corrections: [],
};
