# Plan — AI Apprentice (Hack-Nation 7, Challenge 01)

Started Sat 3.10.2026 16:00 PT. Deadline Sun 06:00 PT. Solo unless a teammate shows up.

## Decisions (logged with reason, undo if wrong)

- **Workflow: the brief's own invoicing sandbox**, built as a fake mini-ERP page inside our app
  (`/erp`). Three supplier invoices: one over the €5,000 capex line, one from a supplier that
  double-bills in December, one from a foreign subsidiary needing second approval. Reason: judges
  know this exact script ("What good looks like"), zero external dependency, we control the screen
  so vision events are reliable. Video-editing demo would be unique but harder for judges to score.
- **Stack: one Next.js app** (`app/`), API routes do the server work. No separate `server/`.
- **Vision + synthesis: Gemini** (key already on the machine). Anthropic key not present; $25 credit
  may take days. Swap is one env var.
- **Voice: ElevenLabs Agents** via `@elevenlabs/react`, client tools for screen events, agent
  created through the API (script in `scripts/`), not by hand in the dashboard.
- **Pause detection**: client-side. No keystrokes for 2.5 s AND no speech (SDK `isSpeaking` /
  user VAD) AND an unasked question is queued → agent may speak. Agent prompt also told to wait.
- **Privacy**: regex + Gemini-side PII masking on frames' text events; "off the record" client tool
  that deletes the last N seconds of transcript/events and marks the step `redacted`.

## Tracks

### T1 Capture (Sat 16:00–20:00)
- [x] scaffold Next.js, Tailwind, pnpm
- [x] `/erp` fake AP inbox: invoice list, invoice detail (supplier, amount, cost center select,
      asset number, approval chain, hold/release, save)
- [x] `getDisplayMedia` → canvas → frame diff (pixel delta threshold) → `/api/vision` → events JSON
- [x] events timeline panel with thumbnails (store frames in memory / IndexedDB)
- [x] ElevenLabs agent: create via API, system prompt (interviewer), client tools
      `screen_event`, `off_the_record`, `end_task`
- [x] pause gate: activity tracker + "question budget" (3–5 per 10 min)

### T2 Map (Sat 20:00–00:00)
- [x] `/api/workmap`: events + transcript → Work Map JSON (strict schema) + open gaps
- [x] debrief mode: agent gets gaps as dynamic variables, asks ≥3, then teach-back, expert confirms
- [x] `/map/[id]` clickable timeline: step → screen moment thumbnail, decision, quote, guardrails

### T3 Teach (Sun 00:00–03:30)
- [x] tutor agent: Work Map as knowledge; watches `/erp` new case (€7,200 equipment invoice)
- [x] guardrail check on `save`: vision event "cost center = 4711 on amount > 5000" → tutor steps in
      before save, replays expert's moment
- [x] mastery summary at end

### T4 Ship (Sun 03:30–05:30)
- [x] privacy demo (mask IBAN/names on screen events; off-the-record)
- [x] public repo https://github.com/fortunto2/ai-apprentice, README, .env.example
- [ ] HackOS wants THREE videos ≤60 s each (MP4/MOV): team introduction, product demo, technical walkthrough + team photo (JPG/PNG) + GitHub link + live URL (https://ai-apprentice-nu.vercel.app). Notes: docs/pitch.md
- [ ] HackOS (team 'SuperDuper' exists, 1 member) + Google Form submit by 05:45

## Blocked on Rustam
- End-to-end voice test (mic + tab share), see docs/demo-script.md. Agent id agent_4101m4211fv1eqq8k2nzkce7h4zz, signed in as info@superduperai.co (not rust.starman): the Creator code needs the Luma email, so credits may need a second account or a workspace invite.
- HackOS: create team, declare challenge 01 in Discord (others did it in `#challenge-01-elevenlabs`).
