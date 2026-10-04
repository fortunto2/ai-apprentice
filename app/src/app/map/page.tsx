"use client";

// Module 2 output: the Work Map as a clickable timeline. Every step → screen moment, decision,
// reason in the expert's words, guardrails. Exports JSON and agent-loadable guardrails.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DEMO_WORKMAP } from "@/lib/demo-workmap";
import { describeCond, exportAgentGuardrails } from "@/lib/guardrails";
import type { WorkMap, WorkMapStep } from "@/lib/schemas";
import { fmtT, loadSession, saveSession, type Session } from "@/lib/session-store";

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function MapPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sel, setSel] = useState<number>(1);

  useEffect(() => {
    loadSession().then((s) => setSession(s));
  }, []);

  const map: WorkMap | undefined = session?.workMap;
  const frames = useMemo(() => new Map((session?.frames ?? []).map((f) => [f.id, f])), [session]);
  const step: WorkMapStep | undefined = map?.steps.find((s) => s.n === sel) ?? map?.steps[0];

  async function useDemo() {
    // Prefer the session produced by the eval run (real frames + events); fall back to the static map.
    let s: Session = { id: "demo", startedAt: Date.now(), events: [], frames: [], transcript: [], workMap: DEMO_WORKMAP };
    try {
      const r = await fetch("/demo-session.json", { cache: "no-store" });
      if (r.ok) s = (await r.json()) as Session;
    } catch {
      /* static fallback */
    }
    await saveSession(s);
    setSession(s);
  }

  if (session === undefined) return <div className="p-10 text-zinc-400">Loading…</div>;
  if (!map)
    return (
      <div className="mx-auto max-w-xl p-10 text-zinc-200">
        <h1 className="text-xl font-semibold">No Work Map yet</h1>
        <p className="mt-2 text-zinc-400">Run a capture session first, or load the demo Work Map produced from a scripted session.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/capture" className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black">Go to Capture</Link>
          <button onClick={useDemo} className="rounded border border-white/15 px-3 py-1.5 text-sm">Load demo Work Map</button>
        </div>
      </div>
    );

  const guard = (id: string) => map.guardrails.find((g) => g.id === id);
  const judgment = map.steps.filter((s) => s.isJudgmentCall).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Home</Link>
        <h1 className="text-lg font-semibold">{map.title}</h1>
        <span className="text-xs text-zinc-500">
          {map.steps.length} steps · {judgment} judgment calls · {map.guardrails.length} guardrails
        </span>
        <span className={`rounded px-2 py-0.5 text-[11px] ${map.confirmedByExpert ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
          {map.confirmedByExpert ? "confirmed by the expert" : "draft, not yet confirmed"}
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => download("work-map.json", map)} className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">Export Work Map</button>
          <button onClick={() => download("agent-guardrails.json", exportAgentGuardrails(map.guardrails, map.title))} className="rounded border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">Export agent guardrails</button>
          <Link href="/teach" className="rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-sky-400">Teach a new hire →</Link>
        </div>
      </header>

      {/* Timeline */}
      <div className="overflow-x-auto border-b border-white/10 px-6 py-4">
        <ol className="flex min-w-max items-stretch gap-2">
          {map.steps.map((s) => {
            const f = s.screenMoment.frameId ? frames.get(s.screenMoment.frameId) : undefined;
            const active = step?.n === s.n;
            return (
              <li key={s.n}>
                <button onClick={() => setSel(s.n)} className={`flex w-44 flex-col rounded-lg border p-2 text-left transition ${active ? "border-sky-400 bg-sky-500/10" : "border-white/10 bg-zinc-900 hover:border-white/25"}`}>
                  {f ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.dataUrl} alt="" className="mb-2 h-24 w-full rounded object-cover ring-1 ring-white/10" />
                  ) : (
                    <div className="mb-2 flex h-24 w-full items-center justify-center rounded bg-white/5 text-[10px] text-zinc-500">no frame</div>
                  )}
                  <div className="text-[10px] text-zinc-500">
                    Step {s.n} · {fmtT(s.screenMoment.t)}
                  </div>
                  <div className="text-xs font-medium leading-snug">{s.title}</div>
                  <div className="mt-1 flex gap-1">
                    {s.isJudgmentCall && <span className="rounded bg-violet-500/20 px-1 text-[10px] text-violet-300">judgment</span>}
                    {s.guardrailIds.map((id) => (
                      <span key={id} className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">{id}</span>
                    ))}
                    {s.redacted && <span className="rounded bg-zinc-500/20 px-1 text-[10px] text-zinc-400">redacted</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6 px-6 py-6">
        {step && (
          <section>
            <div className="text-xs text-zinc-500">
              Step {step.n} of {map.steps.length}
            </div>
            <h2 className="text-xl font-semibold">{step.title}</h2>
            <div className="mt-4 grid grid-cols-[1fr_1fr] gap-6">
              <div>
                {(() => {
                  const f = step.screenMoment.frameId ? frames.get(step.screenMoment.frameId) : undefined;
                  // eslint-disable-next-line @next/next/no-img-element
                  return f ? <img src={f.dataUrl} alt="" className="w-full rounded-lg ring-1 ring-white/10" /> : <div className="flex h-56 items-center justify-center rounded-lg bg-white/5 text-xs text-zinc-500">Screen moment not stored in this session</div>;
                })()}
                <div className="mt-2 text-xs text-zinc-400">
                  <span className="font-mono">{fmtT(step.screenMoment.t)}</span> · {step.screenMoment.caption}
                </div>
              </div>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Decision</dt>
                  <dd className="mt-1">{step.decision}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Reason, in the expert&apos;s words</dt>
                  <dd className="mt-1">
                    {step.reason.quote ? (
                      <blockquote className="border-l-2 border-violet-400 pl-3 italic text-zinc-200">“{step.reason.quote}”</blockquote>
                    ) : (
                      <span className="text-zinc-500">Not explained; {map.confirmedByExpert ? "routine step" : "open gap for the debrief"}.</span>
                    )}
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {step.reason.source === "live" ? `live question at ${step.reason.t != null ? fmtT(step.reason.t) : "?"}` : step.reason.source === "debrief" ? "from the debrief" : "inferred from the screen"}
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Guardrails</dt>
                  <dd className="mt-1 space-y-2">
                    {step.guardrailIds.length === 0 && <span className="text-zinc-500">none for this step</span>}
                    {step.guardrailIds.map((id) => {
                      const g = guard(id);
                      if (!g) return null;
                      return (
                        <div key={id} className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                          <div className="text-xs">
                            <span className="mr-1 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">{g.id} · {g.kind.replace("_", " ")}</span>
                            {g.rule}
                          </div>
                          {g.quote && <div className="mt-1 text-[11px] italic text-zinc-400">“{g.quote}”</div>}
                          {g.check && (
                            <div className="mt-1 font-mono text-[10px] text-zinc-500">
                              when {g.check.when ? describeCond(g.check.when) : "always"} → must {describeCond(g.check.must)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        )}

        <aside className="space-y-6">
          <section>
            <h3 className="text-xs uppercase tracking-wide text-zinc-500">Teach-back (what the apprentice explained)</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{map.summary}</p>
            {map.corrections && map.corrections.length > 0 && (
              <div className="mt-2 text-xs text-emerald-300">Corrected by the expert: {map.corrections.join("; ")}</div>
            )}
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-wide text-zinc-500">All guardrails</h3>
            <ul className="mt-2 space-y-1.5 text-xs">
              {map.guardrails.map((g) => (
                <li key={g.id} className="flex gap-2">
                  <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">{g.id}</span>
                  <span>
                    {g.rule} {g.stepN != null && <button className="text-sky-300 underline" onClick={() => setSel(g.stepN!)}>step {g.stepN}</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-wide text-zinc-500">Open gaps</h3>
            {map.openGaps.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">None left after the debrief.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
                {map.openGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
