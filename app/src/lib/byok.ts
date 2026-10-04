"use client";

// Bring your own keys. Stored in this browser only (localStorage), sent as request headers to our
// own API routes, never persisted server-side. Lets a judge run the demo on their own credits.

export type Keys = { elevenlabs?: string; elevenlabsAgent?: string; gemini?: string };

const KEY = "apprentice:keys";

export function loadKeys(): Keys {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Keys;
  } catch {
    return {};
  }
}

export function saveKeys(k: Keys) {
  try {
    localStorage.setItem(KEY, JSON.stringify(k));
  } catch {
    /* private mode */
  }
}

export function keyHeaders(): Record<string, string> {
  const k = loadKeys();
  const h: Record<string, string> = {};
  if (k.elevenlabs) h["x-elevenlabs-key"] = k.elevenlabs;
  if (k.elevenlabsAgent) h["x-elevenlabs-agent"] = k.elevenlabsAgent;
  if (k.gemini) h["x-gemini-key"] = k.gemini;
  return h;
}

export function hasOwnKeys() {
  const k = loadKeys();
  return Boolean(k.elevenlabs || k.gemini);
}
