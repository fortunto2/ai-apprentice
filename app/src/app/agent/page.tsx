"use client";

// Stretch goal made visible: the Work Map's guardrails are instructions an agent can load. The agent
// works the routine queue in the sandbox ERP and stops where the expert would stop and ask.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NoWorkMap } from "@/components/panel";
import { keyHeaders } from "@/lib/byok";
import { loadDemoSession } from "@/lib/demo-workmap";
import { AGENT_INVOICES } from "@/lib/erp-data";
import type { AgentPatch } from "@/lib/erp-bridge";
import type { WorkMap } from "@/lib/schemas";
import { loadSession, type Session } from "@/lib/session-store";
import type { AgentDecision } from "@/server/agent-decide";

type Entry = { invoiceId: string; status: "thinking" | "applied" | "stopped" | "released" | "error"; decision?: AgentDecision; error?: string; recorded?: boolean };

// When the shared Gemini free tier is gone, the demo Work Map still has a recorded live run to fall back on.
type Recorded = { recordedAt: string; decisions: Record<string, AgentDecision> };
async function recordedDecision(sessionId: string, invoiceId: string): Promise<AgentDecision | null> {
  if (!sessionId.startsWith("demo")) return null;
  const r = await fetch("/demo-agent-decisions.json").catch(() => null);
  if (!r?.ok) return null;
  const data = (await r.json()) as Recorded;
  return data.decisions[invoiceId] ?? null;
}

export default function AgentPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [log, setLog] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const stopGate = useRef<((go: boolean) => void) | null>(null);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);
  const map: WorkMap | undefined = session?.workMap;

  const post = (m: object) => iframe.current?.contentWindow?.postMessage(m, "*");
  const update = (id: string, patch: Partial<Entry>) => setLog((l) => l.map((e) => (e.invoiceId === id ? { ...e, ...patch } : e)));

  async function run() {
    if (!map || running) return;
    setRunning(true);
    setLog([]);
    for (const inv of AGENT_INVOICES) {
      setLog((l) => [...l, { invoiceId: inv.id, status: "thinking" }]);
      post({ type: "agent:open", invoice: inv.id });
      await new Promise((r) => setTimeout(r, 900));
      const res = await fetch("/api/agent-decide", { method: "POST", headers: { "content-type": "application/json", ...keyHeaders() }, body: JSON.stringify({ workMap: map, invoiceId: inv.id }) });
      const data = (await res.json()) as { ok: true; decision: AgentDecision } | { ok: false; error: string };
      let recorded = false;
      let d: AgentDecision;
      if (data.ok) d = data.decision;
      else {
        const rec = await recordedDecision(session?.id ?? "", inv.id);
        if (!rec) {
          update(inv.id, { status: "error", error: data.error });
          continue;
        }
        d = rec;
        recorded = true;
      }
      if (d.action === "stop_and_ask") {
        update(inv.id, { status: "stopped", decision: d, recorded });
        // People keep the judgment call: wait for a human to release or skip this one.
        const go = await new Promise<boolean>((resolve) => (stopGate.current = resolve));
        stopGate.current = null;
        if (go) {
          const patch: AgentPatch = { note: `Released by controller after agent stop: ${d.uncovered}` };
          post({ type: "agent:apply", invoice: inv.id, patch, action: "save" });
          update(inv.id, { status: "released" });
        }
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      const patch: AgentPatch = {};
      if (d.changes.cost_center) patch.cost_center = d.changes.cost_center;
      if (d.changes.asset_number) patch.asset_number = d.changes.asset_number;
      if (d.changes.approval) patch.approval = d.changes.approval;
      if (d.changes.note) patch.note = d.changes.note;
      post({ type: "agent:apply", invoice: inv.id, patch, action: d.finalAction });
      update(inv.id, { status: "applied", decision: d, recorded });
      await new Promise((r) => setTimeout(r, 1800));
    }
    setRunning(false);
  }

  if (session === undefined) return <div className="p-10 text-zinc-400">Loading…</div>;
  if (!map) return <NoWorkMap title="No Work Map for the agent to load" onDemo={() => loadDemoSession().then(setSession)} />;

  const stopped = log.find((e) => e.status === "stopped");

  return (
    <div className="grid h-screen grid-cols-[1fr_440px] bg-zinc-950 text-zinc-100">
      <iframe ref={iframe} src="/erp?mode=agent" className="h-full w-full border-0 bg-white" title="ERP sandbox, agent queue" />
      <aside className="flex h-full flex-col border-l border-white/10 bg-zinc-900">
        <header className="border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold">Agent on the routine queue</div>
          <div className="text-xs text-zinc-400">Loaded: {map.guardrails.length} guardrails, {map.steps.length} steps from the expert&apos;s Work Map. Nothing else.</div>
        </header>
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2">
          <button onClick={run} disabled={running} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-40">
            {running ? "Working…" : `Process ${AGENT_INVOICES.length} invoices`}
          </button>
          <Link href="/map" className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5">Work Map</Link>
        </div>

        <section className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {log.length === 0 && <p className="text-xs text-zinc-500">The agent opens each invoice, reasons only from the Work Map, applies what the expert would do, and stops where she would stop and ask someone.</p>}
          {log.map((e) => {
            const inv = AGENT_INVOICES.find((i) => i.id === e.invoiceId)!;
            const d = e.decision;
            return (
              <div key={e.invoiceId} className={`rounded-lg border p-3 ${e.status === "stopped" ? "border-amber-400/60 bg-amber-500/10" : e.status === "error" ? "border-rose-500/40 bg-rose-500/10" : "border-white/10 bg-zinc-950"}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium">{inv.id}</span>
                  <span className="text-zinc-400">{inv.supplier} · €{inv.amount.toLocaleString("en-IE")}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${e.status === "applied" ? "bg-emerald-500/20 text-emerald-300" : e.status === "stopped" ? "bg-amber-500/30 text-amber-200" : e.status === "released" ? "bg-sky-500/20 text-sky-300" : e.status === "error" ? "bg-rose-500/20 text-rose-300" : "bg-white/10 text-zinc-300"}`}>
                    {e.status === "thinking" ? "reading…" : e.status}
                  </span>
                </div>
                {d && (
                  <div className="mt-2 space-y-1 text-xs">
                    {e.status === "stopped" || e.status === "released" ? (
                      <>
                        <div className="font-medium text-amber-200">Sabine would stop here.</div>
                        <div className="text-zinc-300">{d.uncovered || d.observations}</div>
                        {d.askWhom && <div className="text-zinc-400">Asks: {d.askWhom}</div>}
                      </>
                    ) : (
                      <div className="text-zinc-300">
                        {[d.changes.cost_center && `cost center → ${d.changes.cost_center}`, d.changes.asset_number && `asset ${d.changes.asset_number}`, d.changes.approval && `approval → ${d.changes.approval}`].filter(Boolean).join(" · ") || "kept as pre-coded"}
                        {" · "}
                        {d.finalAction}
                      </div>
                    )}
                    {d.reason && <blockquote className="border-l-2 border-violet-400 pl-2 italic text-zinc-300">“{d.reason}”</blockquote>}
                    {d.applicableGuardrails.length > 0 && (
                      <div className="flex gap-1">
                        {d.applicableGuardrails.map((g) => (
                          <span key={g} className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">{g}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {e.recorded && <div className="mt-1 text-[10px] text-zinc-500">Gemini free tier exhausted: this decision is replayed from a recorded live run of the same Work Map.</div>}
                {e.error && <div className="mt-1 text-xs text-rose-300">{e.error}</div>}
                {e.status === "stopped" && stopped?.invoiceId === e.invoiceId && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => stopGate.current?.(true)} className="rounded bg-sky-500 px-2.5 py-1 text-xs font-medium text-black">Controller: approve &amp; continue</button>
                    <button onClick={() => stopGate.current?.(false)} className="rounded border border-white/15 px-2.5 py-1 text-xs">Leave it, continue</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
        <footer className="border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500">The same guardrail JSON drives the tutor and this agent. Export: Work Map → “Export agent guardrails”.</footer>
      </aside>
    </div>
  );
}
