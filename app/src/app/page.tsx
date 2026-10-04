import Link from "next/link";

const steps = [
  { href: "/capture", n: "1", title: "Capture", text: "The expert shares the screen and works. The apprentice watches, stays quiet, asks why at pauses, then runs a debrief and teaches back." },
  { href: "/map", n: "2", title: "Work Map", text: "Clickable timeline: every step with its screen moment (video), the decision, the reason in the expert's words, and the guardrails." },
  { href: "/teach", n: "3", title: "Teach", text: "A new hire works a case the expert never showed. The tutor coaches in the expert's words and steps in before a guardrail breaks." },
  { href: "/agent", n: "+", title: "Agent", text: "Stretch: the Work Map's guardrails loaded into an agent. It works the routine queue and stops exactly where the expert would stop and ask." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight">AI Apprentice</h1>
        <p className="mt-2 max-w-xl text-zinc-400">Watches how an expert really works, asks why at the right moment, maps the workflow with its guardrails and teaches the next hire. Hack-Nation 7 · ElevenLabs challenge · Team SuperDuper.</p>

        <div className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-5">
          <div className="text-sm font-medium text-emerald-200">Judges: two ways in</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
            <li>
              <b>Full loop with your voice (≈6 min).</b> Open <Link className="underline" href="/capture">Capture</Link>, share <i>this tab</i>, allow the mic, process the three invoices as Sabine (script in the README). Say &quot;that&apos;s it, I&apos;m done&quot; for the debrief, then open the Work Map and Teach.
            </li>
            <li>
              <b>Three minutes, no mic.</b> Open <Link className="underline" href="/map">Work Map</Link> → &quot;Load demo Work Map&quot; (a session produced by our text-only eval: real frames and recording), click a step to replay the moment, then <Link className="underline" href="/agent">Agent</Link> → &quot;Process 5 invoices&quot;. Teach needs a mic.
            </li>
          </ol>
          <p className="mt-2 text-xs text-zinc-500">Shared keys are free tiers: Gemini allows 20 requests per model per day, a full Capture run needs about 30. The <b>Keys</b> button on Capture and Teach takes your own ElevenLabs / Gemini keys (stored in your browser only); a free Gemini key from aistudio.google.com is enough.</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <Link key={s.href} href={s.href} className="rounded-xl border border-white/10 bg-zinc-900 p-5 transition hover:border-white/25 hover:bg-zinc-800">
              <div className="text-xs text-zinc-500">Module {s.n}</div>
              <div className="mt-1 text-lg font-medium">{s.title}</div>
              <p className="mt-2 text-sm text-zinc-400">{s.text}</p>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-xs text-zinc-500">
          Sandbox ERP with invented data: <Link className="underline" href="/erp">/erp</Link>. How it works: <Link className="underline" href="/architecture">/architecture</Link>. Code: <a className="underline" href="https://github.com/fortunto2/ai-apprentice">github.com/fortunto2/ai-apprentice</a>.
        </p>
      </div>
    </main>
  );
}
