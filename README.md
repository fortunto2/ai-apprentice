# AI Apprentice

Hack-Nation 7 · Challenge 01 (ElevenLabs). A voice apprentice that watches how an expert really
does screen work, asks *why* at natural pauses, maps the workflow with its guardrails, and teaches
the next hire on a case the expert never showed.

## Modules

| Module | Route | What happens |
|---|---|---|
| 1 Capture | `/capture` | Expert shares the tab (`getDisplayMedia`). A frame every 1.5 s is pixel-diffed; only changed frames go to Gemini, which returns **events, not video** (PII masked). Events stream into an ElevenLabs agent as contextual updates. A **pause gate** (no typing, no speech, agent silent, ≥3 s idle, budget 3–5 questions per 10 min) decides *when*; the agent decides *what* (reason or guardrail, never what the screen already shows). `off_the_record` strikes the last minute. |
| 2 Map | `/capture` → `/map` | "I'm done" → events + transcript go through a **Schema-Guided Reasoning** cascade (Effect Schema → JSON Schema → constrained decoding): segment steps → attribute quotes → extract guardrails → judge judgment calls → list open gaps → write the teach-back. The agent then runs a spoken **debrief** (≥3 gaps), explains the process back, the expert confirms (`confirm_teachback`). Work Map = clickable timeline; every step links a screen moment, decision, the expert's words, guardrails. Guardrails carry a machine-checkable `when → must` form, exportable for agents. |
| 3 Teach | `/teach` | New hire works `INV-4480` (never shown). Tutor watches the same way, asks for a prediction, and when a guardrail check fails **before the save lands**, pauses the save, says "Sabine would stop here", replays the expert's screen moment (`replay_moment`) and quotes her. `record_mastery` builds the end summary. |

Sandbox ERP (`/erp`) with invented data lives inside the app so the demo has zero external dependencies.

## Stack

Next.js 16 · ElevenLabs Agents (`@elevenlabs/react`, client tools, prompt overrides per role, Expressive Mode) ·
Gemini 3.5 Flash for vision and synthesis · **Effect 4** for the server pipeline (typed errors, retry,
timeout) and Effect Schema for SGR schemas · IndexedDB for the session.

## Run

```bash
cd app
pnpm install
cp .env.example .env.local   # GEMINI_API_KEY, ELEVENLABS_API_KEY
pnpm agent:create            # creates the ElevenLabs agent, writes ELEVENLABS_AGENT_ID
pnpm dev
```

Then `http://localhost:3000`. Live: https://ai-apprentice-nu.vercel.app. Demo walkthrough: `docs/demo-script.md`. Brief: `docs/challenge-01-elevenlabs.txt`.

## Layout

```
app/src/app/erp        sandbox ERP (iframe), posts activity + structured events to the parent
app/src/app/capture    module 1+2 UI, pause gate, debrief flow
app/src/app/map        Work Map timeline
app/src/app/teach      tutor, guardrail interception
app/src/server         Effect pipeline: llm.ts (structured generation), vision.ts, workmap.ts (SGR cascade)
app/src/lib            schemas (Effect Schema), frame capture + diff, guardrail checker, prompts
app/scripts            create-agent.ts (agent + client tools via API)
```
