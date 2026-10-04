// Creates the ElevenLabs agent once. Prompts are overridden per session from the browser,
// so one agent plays interviewer, debriefer and tutor. Run: pnpm agent:create
// Needs ELEVENLABS_API_KEY in app/.env.local. Prints the agent id to put in ELEVENLABS_AGENT_ID.

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { agentConfig } from "../src/server/agent-config.ts";

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

const existing = process.env.ELEVENLABS_AGENT_ID;
const config = agentConfig();

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
