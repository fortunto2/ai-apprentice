// Header names for bring-your-own-key requests. Plain module (no "use client") so both the
// browser (byok.ts) and the route handlers import the same strings.

export const KEY_HEADERS = {
  elevenlabs: "x-elevenlabs-key",
  elevenlabsAgent: "x-elevenlabs-agent",
  gemini: "x-gemini-key",
} as const;

const header = (req: Request, name: string) => req.headers.get(name)?.trim() || undefined;

export const keysFromRequest = (req: Request) => ({
  elevenlabs: header(req, KEY_HEADERS.elevenlabs),
  elevenlabsAgent: header(req, KEY_HEADERS.elevenlabsAgent),
  gemini: header(req, KEY_HEADERS.gemini),
});
