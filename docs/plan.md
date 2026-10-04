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

## Status Sun 4 Oct 00:45 PT — SUBMITTED
- HackOS: project "AI Apprentice", challenge 01, submitted 00:32 PT (eligible, 3/3 videos, photo). Edits open until 06:15.
- Google Form: submitted 00:38 PT ("Your response has been recorded"), responder info@life2film.com, team emails rust.starman + azaika2019.
- Videos: demo/video/01-team-introduction.mp4 (29 s), 02-product-demo.mp4 (39 s), 03-technical-walkthrough.mp4 (43 s). Narration: ElevenLabs TTS.
- Eval `pnpm eval`: 23/23 (text-only, real agent). Demo session with frames in app/public/demo-session.json.
- BYOK: "Keys" button on /capture and /teach; agent auto-created in the visitor's ElevenLabs account.
- ElevenLabs: 01:05 PT switched to a fresh account (rust.starman@gmail.com, 10k credits), new agent
  agent_9401m42yffcpewm8hqc323x6nenk, deployed. Old account quota gone until ~3 Nov.
- Gemini: free-tier 3.5-flash exhausted on both keys; default is now gemini-2.5-flash with key/model rotation.
- Discord: no reply to the credits posts (#api-credits Hack-Nation, #general-chat ElevenLabs).

- 02:10 PT: /simplify pass applied (shared protocol module, useLatest, frame diff before encode, single retry);
  screen recording + video replay of moments in Map/Teach; demo recording webm for the fallback session.

- 02:40 PT: /agent page (agent works the routine queue from the Work Map, stops on the unknown supplier, controller release);
  SGR decision cascade in src/server/agent-decide.ts; Gemini 503 rotates like 429.

- 01:30 PT: eval re-run after refactor: 23/23. Product demo video v3 uploaded to HackOS (Revision 6, eligible).

- 01:40 PT: Gemini 2.5-flash quota gone on both keys; vision now 2.5-flash-lite with thinking off (3 s on prod,
  was 19 s), synthesis/agent on 3.8-flash. Teach has a step list with replay buttons; Capture shows the pause-gate state live.

- 01:50 PT: measured Gemini free tier = 20 requests/model/key/day (3.8-flash, 2.5-flash, 2.5-flash-lite on key 2 already gone,
  reset ~17:00 PT). Rotation now covers 5 models x 2 keys; error message tells the visitor to add a key. From now on:
  no more Gemini smoke tests, the remaining buckets are for the judges. Agent prompt fixed (screen captions carry the
  supplier; 3.8-flash had called Müller unknown and saved the Kowalski invoice).

- 01:54 PT: Capture shows vision failures (quota) in amber and backs off 60 s; DOM events from the sandbox keep the
  demo alive without Gemini. Discord #challenge-01: no replies to the teammate post; HackOS Revision 6 eligible.

- 02:00 PT: /agent falls back to `public/demo-agent-decisions.json` (recorded live run, all 5 correct) when Gemini
  is exhausted, labelled on each card. Monitor armed: prod 200s + ElevenLabs usage.

- 05:56 PT: four minutes before the deadline HackOS still shows submitted · eligible · Revision 6; prod 200 on all
  pages for the whole 4 h watch, ElevenLabs credits untouched (0/10000), no Discord replies. Nothing left to change.

## Blocked on Rustam
- Real voice run on https://ai-apprentice-nu.vercel.app/capture (credits exist now). Budget: ~10 min of talk.
