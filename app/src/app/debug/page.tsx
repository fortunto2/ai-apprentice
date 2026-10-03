"use client";

// Text-only harness for the agent protocol: send [SCREEN] / [PAUSE] / [GUARDRAIL] messages
// and watch what the agent says and which client tools it calls. No mic, no audio.

import { useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { DEMO_WORKMAP } from "@/lib/demo-workmap";
import { INTERVIEWER_PROMPT, debriefPrompt, tutorPrompt } from "@/lib/prompts";

type Line = { who: string; text: string };

declare global {
  interface Window {
    __send?: (text: string, contextual?: boolean) => void;
    __log?: Line[];
    __start?: (role: "interviewer" | "debrief" | "tutor") => Promise<void>;
    __end?: () => void;
  }
}

function Debug() {
  const [lines, setLines] = useState<Line[]>([]);
  const logRef = useRef<Line[]>([]);
  const push = (l: Line) => {
    logRef.current = [...logRef.current, l];
    window.__log = logRef.current;
    setLines(logRef.current);
  };
  const conv = useConversation({
    onMessage: ({ message, source }) => push({ who: source === "ai" ? "agent" : "user", text: message }),
    onError: (m, ctx) => push({ who: "error", text: `${m} ${JSON.stringify(ctx ?? {})}` }),
    onDisconnect: (d) => push({ who: "disconnect", text: JSON.stringify(d) }),
    onDebug: (d) => push({ who: "debug", text: JSON.stringify(d).slice(0, 300) }),
    onStatusChange: ({ status }) => push({ who: "status", text: status }),
    onAgentToolRequest: (p) => push({ who: "tool-request", text: JSON.stringify(p) }),
    clientTools: {
      off_the_record: async (p: unknown) => {
        push({ who: "tool", text: `off_the_record ${JSON.stringify(p)}` });
        return "Removed 3 screen events and the last minute of the expert's words from the record.";
      },
      end_task: async () => push({ who: "tool", text: "end_task" }),
      confirm_teachback: async (p: unknown) => push({ who: "tool", text: `confirm_teachback ${JSON.stringify(p)}` }),
      replay_moment: async (p: { step: number }) => {
        push({ who: "tool", text: `replay_moment ${JSON.stringify(p)}` });
        const s = DEMO_WORKMAP.steps.find((x) => x.n === Number(p.step));
        return s ? `Showing the expert's screen moment for step ${s.n}: ${s.screenMoment.caption}. Expert said: "${s.reason.quote}"` : "no such step";
      },
      record_mastery: async (p: unknown) => push({ who: "tool", text: `record_mastery ${JSON.stringify(p)}` }),
    },
  });

  window.__send = (text, contextual) => {
    push({ who: contextual ? "ctx" : "user", text });
    if (contextual) conv.sendContextualUpdate(text);
    else conv.sendUserMessage(text);
  };
  window.__end = () => conv.endSession();
  window.__start = async (role) => {
    const r = await fetch("/api/agent/token");
    const data = (await r.json()) as { signedUrl: string };
    const prompt = role === "interviewer" ? INTERVIEWER_PROMPT : role === "debrief" ? debriefPrompt({ ...DEMO_WORKMAP, openGaps: ["Is the €5,000 capex limit per invoice or per line item?", "Does the December hold apply to every supplier or only Schwarz?", "Who releases a held invoice, and when?"] }) : tutorPrompt(DEMO_WORKMAP, "two open invoices in the AP workbench");
    const firstMessage = role === "interviewer" ? "Hi, I'm your apprentice today. I'll watch and stay quiet while you work." : role === "debrief" ? "Thanks, the task is done. Let me close a few gaps. First: is the five thousand euro capex limit per invoice or per line item?" : "Hi, I'm your tutor today. Open the first invoice whenever you're ready.";
    conv.startSession({ signedUrl: data.signedUrl, connectionType: "websocket", textOnly: true, overrides: { agent: { prompt: { prompt }, firstMessage, language: "en" }, conversation: { textOnly: true } } });
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 font-mono text-xs text-zinc-200">
      <div className="mb-3 text-zinc-500">status: {conv.status} · use window.__start(role), window.__send(text, contextual?), window.__end()</div>
      <ol className="space-y-1">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="text-zinc-500">{l.who}:</span> {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Page() {
  return (
    <ConversationProvider>
      <Debug />
    </ConversationProvider>
  );
}
