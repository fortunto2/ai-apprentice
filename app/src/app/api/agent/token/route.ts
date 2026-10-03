import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Signed URL for the browser SDK. The API key never leaves the server.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID missing in .env.local" }, { status: 503 });
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = (await res.json()) as { signed_url: string };
  return NextResponse.json({ signedUrl: data.signed_url, agentId });
}
