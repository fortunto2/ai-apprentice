import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { agentConfig } from "@/server/agent-config";

export const runtime = "nodejs";

// Signed URL for the browser SDK. Keys never reach the browser: either ours from env, or the
// visitor's own key passed in a header (bring your own key). With a key but no agent id we create
// the agent in their account once and hand the id back so the browser can remember it.
export async function GET(req: Request) {
  const ownKey = req.headers.get("x-elevenlabs-key")?.trim();
  const apiKey = ownKey || process.env.ELEVENLABS_API_KEY;
  let agentId = ownKey ? req.headers.get("x-elevenlabs-agent")?.trim() || "" : process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey) return NextResponse.json({ error: "No ElevenLabs key: set ELEVENLABS_API_KEY or enter your own key in Settings." }, { status: 503 });

  let created = false;
  if (!agentId) {
    try {
      const client = new ElevenLabsClient({ apiKey });
      const agent = await client.conversationalAi.agents.create(agentConfig());
      agentId = agent.agentId;
      created = true;
    } catch (e) {
      return NextResponse.json({ error: `Could not create an agent with that key: ${String(e).slice(0, 200)}` }, { status: 502 });
    }
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = (await res.json()) as { signed_url: string };
  return NextResponse.json({ signedUrl: data.signed_url, agentId, created, ownKey: Boolean(ownKey) });
}
