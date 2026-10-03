# Pitch (60 s) and demo (60 s)

## Pitch video, 6 beats

1. **Sabine retires in 18 months.** 24 years of judgment: which invoice goes to capex, which supplier
   double-bills in December, when to stop and ask the controller. None of it is written down.
2. **Recorders capture clicks. We capture why.** The AI Apprentice shares her screen, turns every change
   into an event, and asks one short question at the right pause: "You moved that one to capex. What made you do that?"
3. **The debrief closes the gaps.** It asks what it still doesn't understand, explains the whole process back,
   and Sabine corrects one detail. Only then is the Work Map confirmed.
4. **The Work Map is a timeline, not a document.** Every step: screen moment, decision, her words, guardrails.
   The guardrails are machine-checkable (`amount > 5000 → cost_center = 0400`) and export as rules an agent can load.
5. **Lena learns by deciding.** The tutor watches her screen on a case Sabine never showed, asks her to predict,
   and stops the save before the guardrail breaks: "Sabine would stop here. Why do you think?" with Sabine's screen moment.
6. **Moonshot.** See below.

## Moonshot slide: the always-on apprentice for every operations desk

Today: one expert, one task, scheduled session. Next: the apprentice runs in the background of everyday
work. It already has the Work Map, so it only speaks when it sees a case the map does not cover, one
question, at the pause. Every answer updates the map. The maps are the guardrails that let agents take
the routine steps safely while people keep the judgment calls.

Concrete path from today's MVP:
- Frame diff + event extraction already runs continuously; the "new case" detector is the same
  guardrail checker inverted (no rule matched → ask).
- Work Map JSON is already the tutor's knowledge and the agent's guardrails; same artifact, three consumers.
- Field we know: AV operations (Epiphan capture hardware, live production desks). Operators carry exactly
  this kind of unwritten judgment; a capture → map → teach loop for them is our first vertical.

## Demo video, 60 s cut list

0:00 Capture: Sabine changes 4711 → 0400, pause, apprentice asks why, she answers (10 s)
0:10 Events panel with thumbnails; "off the record" + PII masked badge (8 s)
0:18 "I'm done" → debrief question → teach-back → "yes, that's how it works" (14 s)
0:32 Work Map: click step 2, quote, G1 with `when → must`, export agent guardrails (10 s)
0:42 Teach: Lena opens INV-4480, predicts opex, saves → save paused, tutor replays Sabine's moment, she fixes it (14 s)
0:56 Mastery summary (4 s)

## Apprentice Test answers (for Q&A)

1. **When to ask**: client-side pause gate (no keys/mouse 3 s, no user speech via VAD, agent not speaking,
   ≥40 s since the last question, budget 3–5 per 10 min, something new on screen). Agent may still `skip_turn`.
2. **What to ask**: screen events are context, not questions; the prompt forbids asking what the screen shows
   and prioritises reason, limit, exception, stop-and-ask. Unasked events roll into the debrief gaps.
3. **When it has understood**: the Work Map synthesis lists open gaps; the debrief ends only after ≥3 gaps and
   a teach-back the expert confirms via `confirm_teachback` (corrections folded back into the map).
4. **Whether the new hire learned**: a case never shown, prediction questions, guardrail interception before
   save, `record_mastery` per step → mastered / practice summary.
5. **Trust**: `off_the_record` tool and button strike the last 60 s; vision model returns events with PII
   replaced ([PERSON], [IBAN]); on-screen mask toggle; frames stay in the browser (IndexedDB), never uploaded.
