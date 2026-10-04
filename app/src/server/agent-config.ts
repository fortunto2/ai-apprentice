// The ElevenLabs agent definition, shared by scripts/create-agent.ts and the bring-your-own-key
// path (/api/agent/token creates an agent in the visitor's account when they supply only a key).

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { INTERVIEWER_PROMPT } from "../lib/prompts.ts";

type CreateBody = Parameters<ElevenLabsClient["conversationalAi"]["agents"]["create"]>[0];

const obj = (properties: Record<string, { type: "string" | "number" | "boolean"; description: string }>, required: string[]) =>
  ({ type: "object" as const, properties, required }) as never;

export function agentConfig(opts: { llm?: string; voiceId?: string } = {}): CreateBody {
  // The agent LLM runs on ElevenLabs' side, not on our Gemini key: keep the model the eval was run against.
  const llm = (opts.llm ?? process.env.AGENT_LLM ?? "gemini-3.5-flash") as never;
  const voiceId = opts.voiceId ?? process.env.AGENT_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah
  return {
    name: "AI Apprentice",
    tags: ["hack-nation"],
    conversationConfig: {
      agent: {
        firstMessage: "",
        language: "en",
        prompt: {
          prompt: INTERVIEWER_PROMPT,
          llm,
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
              expectsResponse: true,
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
      tts: { modelId: "eleven_v3_conversational", voiceId, expressiveMode: true, stability: 0.5, speed: 1.0 },
      turn: { turnTimeout: 30, turnEagerness: "patient", silenceEndCallTimeout: -1 },
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
          conversation: { textOnly: true },
        },
      },
    },
  };
}
