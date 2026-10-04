"use client";

// Bring-your-own-key panel. A judge with their own ElevenLabs / Gemini credits can run the whole
// demo without touching our quota.

import { useState, useSyncExternalStore } from "react";
import { keysSnapshot, loadKeys, saveKeys, subscribeKeys, type Keys } from "@/lib/byok";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  // Saved keys, hydration-safe: the server snapshot is "{}" so the first client render matches it.
  const saved = JSON.parse(useSyncExternalStore(subscribeKeys, keysSnapshot, () => "{}")) as Keys;
  const [keys, setKeys] = useState<Keys>({});
  const own = Boolean(saved.elevenlabs || saved.gemini);

  return (
    <>
      <button
        onClick={() => {
          setKeys(loadKeys());
          setOpen(true);
        }}
        className={`rounded-md border px-2.5 py-1.5 text-sm ${own ? "border-emerald-400/60 text-emerald-300" : "border-white/15 text-zinc-300 hover:bg-white/5"}`}
        title="Use your own API keys"
      >
        {own ? "Your keys" : "Keys"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-[460px] rounded-xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold">Use your own keys</div>
            <p className="mt-1 text-xs text-zinc-400">
              Stored only in this browser and sent as headers to this app&apos;s own API routes. Leave empty to use the shared demo keys. Their Gemini free tier is 20 requests per model per day; a full Capture run needs about 30, so for a real run paste a free key from aistudio.google.com.
            </p>
            <label className="mt-4 block text-xs text-zinc-400">
              ElevenLabs API key
              <input
                className="mt-1 w-full rounded border border-white/15 bg-zinc-950 px-2 py-1.5 font-mono text-sm"
                placeholder="sk_…"
                value={keys.elevenlabs ?? ""}
                onChange={(e) => setKeys({ ...keys, elevenlabs: e.target.value.trim(), elevenlabsAgent: "" })}
              />
              <span className="text-[11px] text-zinc-500">An agent is created in your account on first use (id: {saved.elevenlabsAgent || "none yet"}).</span>
            </label>
            <label className="mt-3 block text-xs text-zinc-400">
              Gemini API key (vision + Work Map)
              <input
                className="mt-1 w-full rounded border border-white/15 bg-zinc-950 px-2 py-1.5 font-mono text-sm"
                placeholder="AIza…"
                value={keys.gemini ?? ""}
                onChange={(e) => setKeys({ ...keys, gemini: e.target.value.trim() })}
              />
            </label>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => {
                  saveKeys({});
                  setKeys({});
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Clear
              </button>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="rounded border border-white/15 px-3 py-1.5 text-sm">Cancel</button>
                <button
                  onClick={() => {
                    saveKeys(keys);
                    setOpen(false);
                  }}
                  className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
