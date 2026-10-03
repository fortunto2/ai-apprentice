// Creates the ElevenLabs agent once. Prompts are overridden per session from the browser,
// so one agent plays interviewer, debriefer and tutor. Run: pnpm agent:create
// Needs ELEVENLABS_API_KEY in app/.env.local. Prints the agent id to put in ELEVENLABS_AGENT_ID.

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { INTERVIEWER_PROMPT } from "../src/lib/prompts.ts";

function loadEnv() {
  const p = new URL("../.env.local", import.meta.url).pathname;
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv();

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");
const client = new ElevenLabsClient({ apiKey });

const LLM = (process.env.AGENT_LLM ?? "gemini-3.5-flash") as never;
const VOICE = process.env.AGENT_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah

const obj = (properties: Record<string, { type: "string" | "number" | "boolean"; description: string }>, required: string[]) =>
  ({ type: "object" as const, properties, required }) as never;

const existing = process.env.ELEVENLABS_AGENT_ID;
const config = {
  name: "AI Apprentice",
  tags: ["hack-nation"],
  conversationConfig: {
    agent: {
      firstMessage: "",
      language: "en",
      prompt: {
        prompt: INTERVIEWER_PROMPT,
        llm: LLM,
        temperature: 0.4,
        tools: [
          {
            type: "system",
            name: "skip_turn",
            description: "Stay silent this turn. Use after a [PAUSE] or [SCREEN] message when there is nothing worth asking yet.",
            params: { systemToolType: "skip_turn" },
          },
          {
            type: "client",
            name: "off_the_record",
            description: "The expert asked that the last thing they said or did is not recorded. Removes the last ~60 seconds from the record.",
            expectsResponse: true,
            parameters: obj({ reason: { type: "string", description: "what the expert asked to strike, in 5 words" } }, []),
          },
          {
            type: "client",
            name: "end_task",
            description: "The expert or new hire said the task is finished. Ends the capture / teaching session.",
            expectsResponse: false,
            parameters: obj({}, []),
          },
          {
            type: "client",
            name: "confirm_teachback",
            description: "Debrief only. The expert confirmed the teach-back (or corrected it and then confirmed).",
            expectsResponse: false,
            parameters: obj(
              {
                confirmed: { type: "boolean", description: "true when the expert said the explanation is right" },
                corrections: { type: "string", description: "corrections the expert made, verbatim-ish, or empty" },
              },
              ["confirmed"],
            ),
          },
          {
            type: "client",
            name: "replay_moment",
            description: "Tutor only. Shows the expert's screen moment for a Work Map step to the new hire.",
            expectsResponse: true,
            parameters: obj({ step: { type: "number", description: "Work Map step number" } }, ["step"]),
          },
          {
            type: "client",
            name: "record_mastery",
            description: "Tutor only. Records whether the new hire mastered a step or needs practice.",
            expectsResponse: false,
            parameters: obj(
              {
                step: { type: "number", description: "Work Map step number" },
                result: { type: "string", description: "mastered | practice" },
                note: { type: "string", description: "one line, what happened" },
              },
              ["step", "result"],
            ),
          },
        ],
      },
    },
    tts: {
      modelId: "eleven_v3_conversational",
      voiceId: VOICE,
      expressiveMode: true,
      stability: 0.5,
      speed: 1.0,
    },
    turn: {
      turnTimeout: 30, // the agent does not jump in when the expert goes quiet; our pause gate decides
      turnEagerness: "patient",
      silenceEndCallTimeout: -1,
    },
    conversation: {
      maxDurationSeconds: 1800,
      clientEvents: ["audio", "interruption", "user_transcript", "agent_response", "agent_response_correction", "client_tool_call", "vad_score", "ping"],
    },
  },
  platformSettings: {
    overrides: {
      conversationConfigOverride: {
        agent: { prompt: { prompt: true }, firstMessage: true, language: true },
        tts: { voiceId: true },
      },
    },
  },
} satisfies Parameters<typeof client.conversationalAi.agents.create>[0];

if (existing) {
  await client.conversationalAi.agents.update(existing, config);
  console.log("agent updated:", existing);
} else {
  const agent = await client.conversationalAi.agents.create(config);
  console.log("agent_id:", agent.agentId);
  const envPath = new URL("../.env.local", import.meta.url).pathname;
  if (!readFileSync(envPath, "utf8").includes("ELEVENLABS_AGENT_ID")) {
    appendFileSync(envPath, `\nELEVENLABS_AGENT_ID=${agent.agentId}\n`);
    console.log("written to .env.local");
  }
}
