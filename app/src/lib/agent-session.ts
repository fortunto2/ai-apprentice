"use client";

// Token fetch (with the bring-your-own-key handshake) and session start, shared by the pages.

import type { useConversation } from "@elevenlabs/react";
import { keyHeaders, loadKeys, saveKeys } from "./byok";
import type { Lang } from "./protocol";

type Conversation = ReturnType<typeof useConversation>;

export type TokenResponse = { signedUrl?: string; error?: string; agentId?: string; created?: boolean };

export async function fetchSignedUrl(): Promise<TokenResponse> {
  const r = await fetch("/api/agent/token", { headers: keyHeaders() });
  const data = (await r.json()) as TokenResponse;
  // An agent was just created in the visitor's own ElevenLabs account: remember it.
  if (data.created && data.agentId) saveKeys({ ...loadKeys(), elevenlabsAgent: data.agentId });
  return data;
}

export async function connectAgent(
  conv: Conversation,
  o: { prompt: string; firstMessage: string; language: Lang },
): Promise<string | null> {
  // The previous session (capture → debrief) must be fully closed before a new one starts.
  for (let i = 0; i < 20 && conv.status !== "disconnected"; i++) await new Promise((r) => setTimeout(r, 250));
  const data = await fetchSignedUrl();
  if (!data.signedUrl) return data.error ?? "no signed url";
  await navigator.mediaDevices.getUserMedia({ audio: true });
  conv.startSession({
    signedUrl: data.signedUrl,
    connectionType: "websocket",
    overrides: { agent: { prompt: { prompt: o.prompt }, firstMessage: o.firstMessage, language: o.language } },
  });
  return null;
}
