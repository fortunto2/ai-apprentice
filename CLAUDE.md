# AI Apprentice — Hack-Nation 7, Challenge 01 (ElevenLabs)

Hackathon project, built in ~18 hours. Ship over perfect: a working end-to-end demo beats clean architecture.

## The event

- **Hack-Nation 7th Global AI Hackathon**, Sat 3.10 → **Sun 4.10.2026, 06:00 PT submission deadline**
  (uploads stay open 15 min after). Rustam is at the **Stanford Hub**: Nordic Innovation House,
  470 Ramona St, Palo Alto. Online participation counts too.
- Platform: **HackOS** — https://app.hack-nation.ai/?eventId=4ee144f2-dd47-4613-9290-cf3e47509011
  (signed in as rust.starman@gmail.com via Google). Team 1–4 people; create the team in HackOS,
  one member submits.
- **Two submissions required:** HackOS + the Google Form linked from HackOS.
  Deliverables (general FAQ): public code repo, **1-min pitch video + 1-min demo video**.
- Challenge brief: `docs/challenge-01-elevenlabs.txt` (PDF next to it). **Read it fully before planning.**

## What to build (from the brief — all three modules are required)

1. **Capture** — web app: expert shares screen, a frame every 1–2 s goes to a vision model → events
   ("invoice 4471 opened", "cost center 4711 → 0400"). ElevenLabs voice agent in a side panel stays
   quiet while the expert types/reads/talks, asks at natural pauses. **≥3 questions, each about something
   visible on screen, ≥1 about a guardrail.**
2. **Map** — spoken debrief: **≥3 follow-up questions** not answered during the task, then a
   **teach-back the expert confirms**. Output: **Work Map** = clickable timeline; every step has screen
   moment, decision, reason in the expert's own words, guardrails — each linked to a screen moment.
3. **Teach** — voice tutor watches a new hire's screen on a **case the expert never showed**, explains
   in the expert's words, asks them to predict the next decision, **catches ≥1 wrong decision before it
   is saved**, replays the expert's screen moment.

Demo must answer the **Apprentice Test**: when to ask, what to ask, when it has understood, whether
the new hire learned, trust (take something off the record; protect personal data on screen —
Microsoft Presidio suggested). Pitch ends with a **moonshot** slide.
Stretch: two experts one task; any language (expert in Russian/German, tutor teaches in English);
export Work Map as agent-loadable guardrails.

Judging signal from the brief: "Strong" = asks at natural pauses about what is on screen, captures
guardrails, debrief closes gaps with teach-back, tutor teaches to decide. "Weak" = interrupts mid-typing,
generic questions, happy path only, summary written afterwards.

## Suggested wiring (from the brief, adapt freely)

- Browser `getDisplayMedia` → frame every 1–2 s → vision model (Claude / Gemini / GPT) returns
  **events, not video**. Diff consecutive frames first; only send on change.
- **ElevenAgents** (Conversational AI) plays interviewer and tutor; Expressive Mode; pick the LLM.
  **Scribe v2 Realtime** for transcription + pause detection. **Client tools** push screen events into
  the agent conversation.
- After the task: LLM merges events + transcript + answers → **Work Map JSON** (+ list of open gaps
  for the debrief). Use schema-guided output (SGR / strict JSON schema) — this is where Rustam's stack
  is strongest.
- Work Map → tutor's knowledge base / Procedures; tutor watches the new hire's screen the same way.
- Tips from the brief: start with voice + one screen; ask 3–5 live questions per 10 min, rest in debrief.

## Our edge (why this challenge)

Rustam: ex-CTO of a video editor with 1M users (Life2Film), builds video-understanding and agent
pipelines (SGR, Rust/Python/TS). Most teams will build a voice bot that only asks; we win on **real
screen/video understanding** (frame diffing → structured events → timeline with replayable moments)
and a polished Work Map. Possible demo workflow choices (brief says bring your own):
- **Video editing judgment calls** (why this cut, why this take) in a web editor — unique, visual.
- **Issuing an invoice with VAT rules** — Rustam has his own invoicing CRM (`~/startups/solopreneur/6-crm`),
  real guardrails (KDV/tax ID, provider entity choice). Run on fake data only.
- Fallback: the brief's own sandbox (three supplier invoices, €5,000 capex line, December double-billing).
Also relevant to Epiphan (his client: video capture hardware) — a capture→map→teach loop for
AV operators is a credible moonshot.

## Reuse our own video stack (pre-existing, open about it in README)

Rustam's Rust video workspaces already do the hard parts of Capture and Map:
- `~/startups/active/life2film/video-analyzer` — frame-level analysis: sampling, scene/shot detection
  (`va-scene`), motion/temporal features, STT (`va-stt`), agent (`va-agent`). Domain model
  `Segment → Frames → Moment → Shot → Clip (OTIO)` maps directly onto "screen moments".
- `~/startups/active/video-generator-agent/crates/` — shared `video-core` (Timeline, Shot, frame),
  `video-otio` (OTIO timelines), `video-render` (ffmpeg helpers: cut a clip at a timestamp).
How to use them here:
- **Capture**: only send a frame to the vision model when `va-scene`/frame-diff says the screen changed —
  cheaper and gives natural "moments".
- **Work Map**: store each step as an OTIO clip (source range = screen moment) → the timeline is
  exportable, and `video-render` cuts the 5–10 s replay clips the tutor plays back in Teach.
- Don't fight the stack under time pressure: if wiring Rust into the web app costs more than an hour,
  call it as a CLI (`cargo run -p …` / built binary) from the server, or reimplement the frame diff in TS.

## Credits & accounts (claimed in HackOS → Credits & Codes)

- **ElevenLabs Creator 1 month**: code comes from ElevenLabs' redemption Discord channel; must use the
  same email as on Luma/Hack-Nation (**rust.starman@gmail.com**). "No active subscription" error =
  wrong email.
- **Anthropic $25**: platform.claude.com/offers/86c8a368-b624-4f88-a9cc-822114124cc9 (needs his login;
  processing can take 1–2 business days — don't depend on it today).
- Lovable Pro 1 month: `COMM-HACKNATION-YFRCJCLB`. BrightData $300: `hacknation26` (many report it fails).
- Cursor credits on his account ($48 left, expire 29.10).
- Never put API keys in the repo. Use `.env.local` (gitignored).

## Discord (Hack-Nation server)

- Server: Hack-Nation; channels `#challenge-01-elevenlabs`, `#stanford` (hub), `#api-credits`,
  `#q-and-a`, `#mentors`, `#project-submission`, `#faq`. Rustam's account: **Rusty | SuperDuperAi**.
- Already posted (3.10 ~11:25 PT) a teammate search in `#challenge-01-elevenlabs` and `#stanford`.
  Check DMs/replies before posting again; don't spam.
- **Rules for writing in his name:** English, 2–3 short human sentences, no marketing tone, no em dashes,
  no "excited to", concrete ask. Post only what he asked for; questions to mentors are fine.
- Browser: Chrome is driven via chrome-devtools MCP. Discord's composer is a Slate editor —
  `document.execCommand` does NOT register; focus the `[role=textbox]` and use the `type_text` tool
  with `submitKey: "Enter"`.

## Constraints (his standing rules)

- No payments, no checkout, no entering card data. No captchas.
- Don't cancel or withdraw any registration without his explicit «отмени».
- Don't touch Epiphan mail/Slack.
- Russian for talking to him, English for code/docs/repo/pitch.

## Repo layout (to create)

```
app/          web app (Next.js or Vite) — capture UI, Work Map timeline, tutor view
server/       agent glue: frame→event pipeline, Work Map synthesis, ElevenAgents client tools
docs/         challenge brief, pitch notes, demo script
demo/         sample workflow data (fake invoices / project files)
```

Public GitHub repo under `fortunto2` when ready (submission requires a public repo).

## Timeline (PT)

- Sat afternoon: scope + pick workflow + get ElevenLabs agent talking with screen events.
- Sat night: Map (debrief + Work Map JSON + timeline UI).
- Sun early: Teach (tutor catches a wrong decision), privacy toggle, record 2 videos.
- **Sun 06:00 submit** (HackOS + Google Form). Sun 09:00 he has another hack (Neon, SF) and a 17:08 SFO
  drop-off, so nothing can slip past 06:00.
