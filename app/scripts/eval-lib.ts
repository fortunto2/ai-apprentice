// Text-only ElevenLabs conversation over a raw WebSocket (Node 22, no browser, no audio) plus a
// Gemini-played expert persona. Same pattern as an LLM-vs-LLM sales-call simulator: scripted screen, LLM counterpart,
// real agent, invariants checked afterwards.

export type ToolHandler = (name: string, params: Record<string, unknown>) => Promise<string | void> | string | void;

export type Turn = { who: "agent" | "user" | "ctx" | "tool" | "status"; text: string; t: number };

export class TextConversation {
  private ws!: WebSocket;
  readonly log: Turn[] = [];
  private t0 = Date.now();

  private onTool: ToolHandler;

  constructor(onTool: ToolHandler) {
    this.onTool = onTool;
  }

  static async open(opts: { base: string; prompt: string; firstMessage: string; language?: string; onTool: ToolHandler }) {
    const r = await fetch(`${opts.base}/api/agent/token`);
    const { signedUrl } = (await r.json()) as { signedUrl: string };
    const c = new TextConversation(opts.onTool);
    await c.connect(signedUrl, opts);
    return c;
  }

  private connect(url: string, opts: { prompt: string; firstMessage: string; language?: string }) {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            conversation_config_override: {
              agent: { prompt: { prompt: opts.prompt }, first_message: opts.firstMessage, language: opts.language ?? "en" },
              conversation: { text_only: true },
            },
          }),
        );
      };
      ws.onerror = (e) => reject(new Error(`ws error ${String((e as ErrorEvent).message ?? e)}`));
      ws.onclose = (e) => {
        this.push({ who: "status", text: `closed ${e.code} ${e.reason}` });
      };
      ws.onmessage = async (m) => {
        const ev = JSON.parse(String(m.data));
        switch (ev.type) {
          case "conversation_initiation_metadata":
            this.push({ who: "status", text: "connected" });
            resolve();
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong", event_id: ev.ping_event.event_id }));
            break;
          case "agent_response":
            this.push({ who: "agent", text: ev.agent_response_event.agent_response });
            break;
          case "client_tool_call": {
            const call = ev.client_tool_call;
            this.push({ who: "tool", text: `${call.tool_name} ${JSON.stringify(call.parameters)}` });
            let result: string | void;
            try {
              result = await this.onTool(call.tool_name, call.parameters);
            } catch (e) {
              result = String(e);
            }
            ws.send(JSON.stringify({ type: "client_tool_result", tool_call_id: call.tool_call_id, result: result ?? "ok", is_error: false }));
            break;
          }
          default:
            break;
        }
      };
    });
  }

  private push(t: Omit<Turn, "t">) {
    this.log.push({ ...t, t: Date.now() - this.t0 });
  }

  /** Collect agent output until `quiet` ms pass without new agent text or tool calls. */
  async settle(quiet = 2500, max = 20_000): Promise<Turn[]> {
    const start = this.log.length;
    const deadline = Date.now() + max;
    let last = Date.now();
    while (Date.now() < deadline) {
      const before = this.log.length;
      await new Promise((r) => setTimeout(r, 250));
      if (this.log.length > before) last = Date.now();
      else if (Date.now() - last > quiet && this.log.length > start) break;
      else if (Date.now() - last > quiet * 4) break;
    }
    return this.log.slice(start).filter((t) => t.who === "agent" || t.who === "tool");
  }

  say(text: string) {
    this.push({ who: "user", text });
    this.ws.send(JSON.stringify({ type: "user_message", text }));
  }

  context(text: string) {
    this.push({ who: "ctx", text });
    this.ws.send(JSON.stringify({ type: "contextual_update", text }));
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

// Gemini plays the expert: answers only from the persona facts, short, in the expert's language.
export async function personaAnswer(opts: { apiKey: string; model?: string; fallbackKey?: string; persona: string; language: string; history: Turn[]; question: string }) {
  const sys = `You are role-playing an expert at work who is being shadowed by an AI apprentice. Stay in character. Answer the apprentice's question in 1-2 short spoken sentences, in ${opts.language}, using ONLY these facts; if the facts do not cover it, say you are not sure or that it depends, briefly. Never list, never explain more than asked.\n\nFACTS:\n${opts.persona}`;
  const hist = opts.history
    .filter((t) => t.who === "agent" || t.who === "user")
    .slice(-8)
    .map((t) => `${t.who === "agent" ? "Apprentice" : "Expert"}: ${t.text}`)
    .join("\n");
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: `Conversation so far:\n${hist}\n\nApprentice just asked: ${opts.question}\n\nExpert says:` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  };
  const call = (key: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model ?? "gemini-2.5-flash-lite"}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  let r = await call(opts.apiKey);
  if (r.status === 429 && opts.fallbackKey) r = await call(opts.fallbackKey);
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim() || "Hm, that depends.";
}

export { fmtT as fmt } from "../src/lib/time.ts";
