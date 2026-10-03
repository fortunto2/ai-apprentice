import Link from "next/link";

const steps = [
  { href: "/capture", n: "1", title: "Capture", text: "The expert shares the screen and works. The apprentice watches, stays quiet, asks why at pauses, then runs a debrief and teaches back." },
  { href: "/map", n: "2", title: "Work Map", text: "Clickable timeline: every step with its screen moment, the decision, the reason in the expert's words, and the guardrails." },
  { href: "/teach", n: "3", title: "Teach", text: "A new hire works a case the expert never showed. The tutor coaches in the expert's words and steps in before a guardrail breaks." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">AI Apprentice</h1>
        <p className="mt-2 max-w-xl text-zinc-400">Watches how an expert really does screen work, asks why at the right moment, maps the workflow with its guardrails and teaches the next hire. Hack-Nation 7 · ElevenLabs challenge.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <Link key={s.href} href={s.href} className="rounded-xl border border-white/10 bg-zinc-900 p-5 transition hover:border-white/25 hover:bg-zinc-800">
              <div className="text-xs text-zinc-500">Module {s.n}</div>
              <div className="mt-1 text-lg font-medium">{s.title}</div>
              <p className="mt-2 text-sm text-zinc-400">{s.text}</p>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-xs text-zinc-500">
          Sandbox ERP with invented data: <Link className="underline" href="/erp">/erp</Link>. Share the Capture tab itself when asked which screen to share.
        </p>
      </div>
    </main>
  );
}
