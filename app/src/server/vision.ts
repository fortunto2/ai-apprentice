// Frame pair → screen events. Cascade: describe what is on screen → decide if it changed → list events → PII.

import { VISION_MODEL, dataUrlToInline, generateStructured, type Part } from "./llm";
import { VisionResult } from "@/lib/schemas";

const SYSTEM = `You watch an expert's screen during desk work (accounts payable in an ERP) and turn what CHANGED between two consecutive screenshots into short events.

Rules:
- First describe what the CURRENT frame shows (whatIsOnScreen). Then compare with PREVIOUS.
- Report only meaningful changes: a record opened, a field value changed (from → to), save/approve/hold, navigation. Ignore cursor, hover, scroll jitter, clocks, tooltips.
- If nothing meaningful changed: changed=false, events=[].
- Be concrete: use identifiers you can read (invoice numbers, amounts, cost center codes, supplier/company names).
- NEVER output personal data: person names, emails, phone numbers, IBANs, street addresses. Write [PERSON], [EMAIL], [IBAN] instead. Company names and invoice numbers are fine. List categories seen in piiSeen.
- Ignore the dark side panel on the right edge if present: it is the apprentice's own UI (events list, transcript), not the expert's work.
- One event per change, summary under 20 words. Do not repeat events listed in RECENT EVENTS.`;

export function describeFrameChange(input: { prev: string | null; curr: string; recent: ReadonlyArray<string> }) {
  const parts: Part[] = [];
  if (input.prev) parts.push({ text: "PREVIOUS frame:" }, dataUrlToInline(input.prev));
  else parts.push({ text: "No previous frame: describe what is open now as one 'open' or 'navigate' event." });
  parts.push({ text: "CURRENT frame:" }, dataUrlToInline(input.curr));
  parts.push({ text: `RECENT EVENTS:\n${input.recent.slice(-8).join("\n") || "(none)"}` });
  return generateStructured({ stage: "vision", model: VISION_MODEL, schema: VisionResult, system: SYSTEM, parts, timeoutMs: 20_000 });
}
