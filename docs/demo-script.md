# Demo script (expert session ≈ 4 min, teach ≈ 2 min)

Open `http://localhost:3000/capture`. Click **Share screen & start** → pick **This tab**
(Chrome tab share). Allow the mic. The apprentice says hi and goes quiet.

## Expert: Sabine (you)

Talk a little while you work; the apprentice only asks at pauses.

1. Open **INV-4471** (Müller, €7,850, hydraulic press). Read it for a few seconds.
   Say: "Equipment invoice, over five thousand." Change cost center **4711 → 0400**.
   Pause 3–4 s. → Expected question: *"You moved that one to capex. What made you do that?"*
   Answer: **"Equipment over five thousand euros is always capex. Below that it stays opex."**
2. Type asset number **AN-2026-0187**. Pause. → Possible question about the asset number.
   Answer: **"No asset number, no capex booking. If I can't find one I ask the controller before I save."**
   Click **Approve & save**.
3. Open **INV-4472** (Schwarz, €1,240, December freight). Say: "Schwarz again, December."
   Type note **check against Nov invoice**, click **Hold**. Pause.
   → Expected question about the hold. Answer: **"Schwarz double-bills every December, they send
   the November freight again. I hold it until I've compared it with November."**
4. Open **INV-4473** (Novák, CZ subsidiary, €3,900). Set approval → **Second approval (controller)**.
   Say: **"Anything from the Czech subsidiary goes to the controller too, it has to match on their side."**
   Save.
5. Privacy beat: say **"Off the record: the controller is on sick leave until January."**
   The apprentice should call `off_the_record` and acknowledge. Toggle **Mask PII** to show
   the IBAN/contact blur on screen; the events panel notes PII was masked before it reached the record.
6. Say **"That's it, I'm done."** → apprentice calls `end_task` → Work Map draft (≈20 s) → debrief.

## Debrief

The apprentice asks ≥3 gaps (e.g. "Is the €5,000 limit per invoice or per line?", "Does the December
hold apply to every supplier?", "Who releases a held invoice?"). Answer briefly. It then explains the
whole process back. Correct one detail (e.g. "the limit is net, without VAT"). Say **"Yes, that's how
it works."** → `confirm_teachback` → final Work Map → **Open Work Map**.

## Work Map

Click steps; show screen moment, quote, guardrails G1–G4, the machine-checkable `when → must`
line, Export agent guardrails. Then **Teach a new hire →**.

## New hire: Lena (judge)

`/teach` → **Start tutoring** (share tab again, or skip). Open **INV-4480** (Bauer, €7,200, CNC spindle,
pre-coded 4711). Wait ~9 s looking at it → tutor asks you to predict. Then "reach for opex": leave
**4711** and click **Approve & save** (or change asset number first). → Save is paused, tutor says
*"Sabine would stop here. Why do you think?"*, replays step 2 with the quote. Fix: **0400** + asset
number → save goes through, tutor confirms, `record_mastery`. Open **INV-4481** (Schwarz, Dec) → hold it
yourself → mastered. Say "I'm done" → mastery summary.

## Fallbacks

- No capture session: `/map` and `/teach` offer **Load demo Work Map** (produced by the same pipeline from a scripted session).
- Screen share denied: the tutor still gets app events (DOM mirror); vision events are the bonus layer.
