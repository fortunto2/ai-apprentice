// End-to-end eval without voice: real ElevenLabs agent (text-only), real Gemini for the Work Map,
// a Gemini-played expert, scripted screen events. Checks the brief's requirements as invariants.
//
//   pnpm eval                      all cases
//   pnpm eval -- --case sabine-invoicing --write-demo   also writes public/demo-session.json with frames
//
// Needs the dev server on EVAL_BASE (default http://localhost:3000) and GEMINI_API_KEY in .env.local.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { TextConversation, personaAnswer, fmt, type Turn } from "./eval-lib.ts";
import { interviewerPrompt, debriefPrompt, tutorPrompt } from "../src/lib/prompts.ts";
import { violations, describeCond } from "../src/lib/guardrails.ts";
import type { WorkMap, ScreenEvent, TranscriptLine } from "../src/lib/schemas.ts";

const BASE = process.env.EVAL_BASE ?? "http://localhost:3000";
const GEMINI = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI2 = process.env.GOOGLE_API_KEY ?? "";
const args = process.argv.slice(2);
const only = args.includes("--case") ? args[args.indexOf("--case") + 1] : null;
const writeDemo = args.includes("--write-demo");

type Case = {
  id: string;
  language: string;
  expert: { name: string; persona: string };
  timeline: Array<{ t: number; event?: Omit<ScreenEvent, "t" | "source">; pause?: boolean; say?: string }>;
  newHire: { case: string; wrongState: Record<string, unknown>; prediction: string; fix: string; fixedState: Record<string, unknown> };
  expect: {
    capture: { minQuestions: number; guardrailQuestion: boolean; offTheRecord: boolean; endTask: boolean };
    workmap: { minSteps: number; maxSteps: number; minGuardrails: number; minChecks: number; quotesVerbatim: boolean; minGaps: number };
    debrief: { minQuestions: number; teachBack: boolean; confirm: boolean };
    teach: { stepsIn: boolean; replay: boolean; mastery: boolean };
  };
};

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? `  (${detail})` : ""}`);
};

const GUARDRAIL_WORDS = /limit|threshold|always|never|exception|stop|ask (someone|the|your)|who (decides|approves|releases)|every (supplier|time|invoice)|only (schwarz|this)|rule|allowed|above|below|without|on hold|hold .*check|second approval|requires?|what would change|when would you/i;
const isQuestion = (s: string) => s.trim().endsWith("?") || /\?/.test(s);

async function runCapture(c: Case) {
  console.log(`\n[capture] ${c.id}`);
  const tools: string[] = [];
  const conv = await TextConversation.open({
    base: BASE,
    prompt: interviewerPrompt(c.language),
    firstMessage: "Hi, I'm your apprentice today. I'll watch and stay quiet while you work.",
    language: c.language,
    onTool: (name) => {
      tools.push(name);
      if (name === "off_the_record") return "Removed 2 screen events and the last minute of the expert's words from the record.";
    },
  });
  await conv.settle(1500, 6000);
  const events: ScreenEvent[] = [];
  const transcript: TranscriptLine[] = [];
  let questions = 0;
  let guardrailQ = false;
  let silentPauses = 0;
  const unasked: ScreenEvent[] = [];
  const langName = c.language === "ru" ? "Russian" : c.language === "de" ? "German" : "English";

  const answer = async (q: string, t: number) => {
    const a = GEMINI ? await personaAnswer({ apiKey: GEMINI, fallbackKey: GEMINI2, persona: c.expert.persona, language: langName, history: conv.log, question: q }) : "It depends.";
    transcript.push({ t: t + 3000, role: "expert", text: a });
    conv.say(a);
    const reply = await conv.settle(2000, 10_000);
    for (const r of reply) if (r.who === "agent") transcript.push({ t: t + 6000, role: "apprentice", text: r.text });
  };

  for (const step of c.timeline) {
    if (step.event) {
      const ev: ScreenEvent = { ...step.event, t: step.t, source: step.event.id.startsWith("v") ? "vision" : "dom" };
      events.push(ev);
      unasked.push(ev);
      conv.context(`[SCREEN] ${fmt(ev.t)} ${ev.summary}`);
      await new Promise((r) => setTimeout(r, 300));
    } else if (step.pause) {
      const recent = unasked.splice(0).map((e) => `- ${fmt(e.t)} ${e.summary}`).join("\n");
      conv.say(`[PAUSE] The expert has been idle for 4 s. Recent screen events:\n${recent || "(nothing new)"}\nAsk ONE short question about a reason or a guardrail behind these, or call skip_turn.`);
      const out = await conv.settle(2500, 15_000);
      const q = out.find((o) => o.who === "agent");
      if (!q) {
        silentPauses++;
        console.log(`    ${fmt(step.t)} pause → silence`);
        continue;
      }
      questions += isQuestion(q.text) ? 1 : 0;
      if (GUARDRAIL_WORDS.test(q.text)) guardrailQ = true;
      transcript.push({ t: step.t, role: "apprentice", text: q.text });
      console.log(`    ${fmt(step.t)} Q: ${q.text}`);
      await answer(q.text, step.t);
      console.log(`    ${fmt(step.t + 3)} A: ${transcript[transcript.length - 1]?.role === "expert" ? transcript[transcript.length - 1].text : transcript.filter((l) => l.role === "expert").slice(-1)[0]?.text}`);
    } else if (step.say) {
      transcript.push({ t: step.t, role: "expert", text: step.say });
      conv.say(step.say);
      let out = await conv.settle(2500, 15_000);
      if (out.some((o) => o.who === "agent" && /done with the whole task|are you done|finished with everything/i.test(o.text))) {
        transcript.push({ t: step.t + 2000, role: "expert", text: "Yes, the whole task is done." });
        conv.say("Yes, the whole task is done.");
        out = [...out, ...(await conv.settle(2500, 15_000))];
      }
      for (const o of out) if (o.who === "agent") transcript.push({ t: step.t + 2000, role: "apprentice", text: o.text });
      console.log(`    ${fmt(step.t)} expert: ${step.say}\n    → ${out.map((o) => `${o.who}: ${o.text}`).join(" | ") || "(silence)"}`);
    }
  }
  conv.close();

  const e = c.expect.capture;
  check("capture: ≥3 questions at pauses", questions >= e.minQuestions, `${questions}`);
  check("capture: ≥1 question about a guardrail", guardrailQ === e.guardrailQuestion);
  check("capture: off_the_record tool called", tools.includes("off_the_record") === e.offTheRecord, tools.join(","));
  check("capture: end_task tool called", tools.includes("end_task") === e.endTask);
  check("capture: never asks what the screen shows", !transcript.some((l) => l.role === "apprentice" && /which invoice|what (is|was) the amount|what supplier/i.test(l.text)));
  // off the record: redact the last minute before the strike
  const strikeT = c.timeline.find((s) => s.say?.toLowerCase().includes("off the record"))?.t ?? Infinity;
  const redactedTranscript = transcript.map((l) => (l.role === "expert" && l.t <= strikeT && l.t >= strikeT - 60_000 ? { ...l, text: "", redacted: true } : l));
  return { events, transcript: redactedTranscript };
}

async function runWorkMap(c: Case, events: ScreenEvent[], transcript: TranscriptLine[], extra?: { debrief: TranscriptLine[]; previous: WorkMap }) {
  console.log(`\n[workmap] ${extra ? "final" : "draft"}`);
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/workmap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events, transcript, expertName: c.expert.name, ...(extra ?? {}) }),
  });
  const j = (await r.json()) as { ok: true; workMap: WorkMap } | { ok: false; error: string };
  if (!j.ok) throw new Error(`workmap failed: ${j.error}`);
  const m = j.workMap;
  console.log(`    ${Date.now() - t0} ms · ${m.steps.length} steps · ${m.guardrails.length} guardrails · ${m.openGaps.length} gaps`);
  for (const s of m.steps) console.log(`    ${s.n}. ${s.title} [${s.reason.source}] frame=${s.screenMoment.frameId} "${s.reason.quote.slice(0, 70)}"`);
  for (const g of m.guardrails) console.log(`    ${g.id} ${g.kind}: ${g.rule}${g.check ? ` → when ${g.check.when ? describeCond(g.check.when) : "always"} must ${describeCond(g.check.must)}` : ""}`);
  const e = c.expect.workmap;
  const frameIds = new Set(events.map((x) => x.frameId));
  const spoken = transcript.filter((l) => l.role === "expert" && !l.redacted).map((l) => l.text.toLowerCase());
  const verbatim = m.steps.filter((s) => s.reason.quote).every((s) => spoken.some((t) => t.includes(s.reason.quote.toLowerCase().slice(0, 40))));
  if (!extra) {
    check("workmap: 4–9 steps", m.steps.length >= e.minSteps && m.steps.length <= e.maxSteps, `${m.steps.length}`);
    check("workmap: every step frameId exists in events", m.steps.every((s) => !s.screenMoment.frameId || frameIds.has(s.screenMoment.frameId)));
    check("workmap: ≥3 guardrails", m.guardrails.length >= e.minGuardrails, `${m.guardrails.length}`);
    check("workmap: ≥2 machine-checkable guardrails", m.guardrails.filter((g) => g.check).length >= e.minChecks);
    check("workmap: quotes are verbatim from the expert", verbatim);
    check("workmap: open gaps for the debrief", m.openGaps.length >= e.minGaps, `${m.openGaps.length}`);
    check("workmap: off-the-record content absent", !JSON.stringify(m).toLowerCase().includes("sick leave"));
  } else {
    check("workmap(final): still ≥3 guardrails", m.guardrails.length >= e.minGuardrails, `${m.guardrails.length}`);
    check("workmap(final): fewer or equal open gaps after debrief", m.openGaps.length <= extra.previous.openGaps.length, `${extra.previous.openGaps.length} → ${m.openGaps.length}`);
  }
  return m;
}

async function runDebrief(c: Case, map: WorkMap) {
  console.log(`\n[debrief]`);
  let confirmed: { confirmed: boolean; corrections?: string } | null = null;
  const conv = await TextConversation.open({
    base: BASE,
    prompt: debriefPrompt(map, c.language),
    firstMessage: `Thanks, the task is done. Let me close a few gaps before I explain it back. First: ${map.openGaps[0] ?? "which of these steps would a new hire most likely get wrong?"}`,
    language: c.language,
    onTool: (name, p) => {
      if (name === "confirm_teachback") confirmed = p as { confirmed: boolean; corrections?: string };
    },
  });
  await conv.settle(1500, 6000);
  const transcript: TranscriptLine[] = [];
  const langName = c.language === "ru" ? "Russian" : c.language === "de" ? "German" : "English";
  let t = 0;
  let questions = 0;
  let teachBackSeen = false;
  for (let i = 0; i < 10 && !confirmed; i++) {
    const lastAgent = [...conv.log].reverse().find((x) => x.who === "agent");
    if (!lastAgent) break;
    if (!transcript.some((l) => l.role === "apprentice" && l.text === lastAgent.text)) transcript.push({ t: (t += 5000), role: "apprentice", text: lastAgent.text });
    const isTeachBack = /explain it back|is that how it works|stop me if/i.test(lastAgent.text) && lastAgent.text.length > 300;
    if (isTeachBack) teachBackSeen = true;
    else if (isQuestion(lastAgent.text)) questions++;
    console.log(`    agent: ${lastAgent.text.slice(0, 160)}${lastAgent.text.length > 160 ? "…" : ""}`);
    const reply = isTeachBack
      ? "Yes. One correction: the limit is on the net total, without VAT. Otherwise that is exactly how it works."
      : GEMINI
        ? await personaAnswer({ apiKey: GEMINI, fallbackKey: GEMINI2, persona: c.expert.persona, language: langName, history: conv.log, question: lastAgent.text })
        : "Yes, that is right.";
    transcript.push({ t: (t += 5000), role: "expert", text: reply });
    console.log(`    expert: ${reply}`);
    conv.say(reply);
    await conv.settle(2500, 25_000);
  }
  conv.close();
  const e = c.expect.debrief;
  check("debrief: ≥3 follow-up questions", questions >= e.minQuestions, `${questions}`);
  check("debrief: teach-back given", teachBackSeen === e.teachBack);
  check("debrief: confirm_teachback called with confirmed=true", Boolean(confirmed && (confirmed as { confirmed: boolean }).confirmed) === e.confirm, JSON.stringify(confirmed));
  return { transcript, confirmed: confirmed as { confirmed: boolean; corrections?: string } | null };
}

async function runTeach(c: Case, map: WorkMap) {
  console.log(`\n[teach] ${c.newHire.case}`);
  const tools: Array<{ name: string; p: Record<string, unknown> }> = [];
  const conv = await TextConversation.open({
    base: BASE,
    prompt: tutorPrompt(map, "two open invoices in the AP workbench, December close"),
    firstMessage: "Hi, I'm your tutor today. Open the first invoice whenever you're ready.",
    language: "en",
    onTool: (name, p) => {
      tools.push({ name, p });
      if (name === "replay_moment") {
        const s = map.steps.find((x) => x.n === Number(p.step));
        return s ? `Showing the expert's screen moment for step ${s.n}: ${s.screenMoment.caption}. Expert said: "${s.reason.quote}"` : "no such step";
      }
    },
  });
  await conv.settle(1500, 6000);
  const st = c.newHire.wrongState as Parameters<typeof violations>[1];
  conv.say(`[SCREEN] ${c.newHire.case} opened. Orient the new hire in one sentence (what this case is, what to look at), do not reveal the decision.`);
  await conv.settle(2500, 12_000);
  conv.say(`[PREDICT] The new hire has been looking at ${st.invoice} (${st.supplier}, €${st.amount}, cost center ${st.cost_center}, approval ${st.approval}) for a few seconds without changing anything. Ask them to predict what the expert would do with this one and why. One question.`);
  await conv.settle(2500, 12_000);
  conv.say(c.newHire.prediction);
  await conv.settle(2500, 12_000);
  // The guardrail checker is the real one from the app, fed with the Work Map it just produced.
  const v = violations(map.guardrails, st, true);
  check("teach: guardrail checker flags the wrong decision", v.length > 0, v.map((x) => x.guardrail.id).join(","));
  if (v.length) {
    const g = v[0].guardrail;
    const stepN = g.stepN ?? map.steps.find((s) => s.guardrailIds.includes(g.id))?.n ?? 1;
    conv.say(
      `[GUARDRAIL] The new hire is about to SAVE ${st.invoice} (${st.supplier}, €${st.amount}) with cost center ${st.cost_center}, asset ${st.asset_number || "none"}, approval ${st.approval}, status ${st.status}. This breaks guardrail ${g.id}: ${g.rule} (expected ${describeCond(v[0].expected)}). The expert's words: "${g.quote ?? ""}". Step in now: say the expert would stop here and ask why they think so, then call replay_moment with step ${stepN}, explain the rule in the expert's words, and say what to change. The save is paused until they fix it.`,
    );
    await conv.settle(3000, 20_000);
  }
  conv.say(c.newHire.fix);
  await conv.settle(2500, 12_000);
  const fixed = c.newHire.fixedState as Parameters<typeof violations>[1];
  const v2 = violations(map.guardrails, fixed, true);
  check("teach: checker passes the fixed decision", v2.length === 0, v2.map((x) => x.guardrail.id).join(","));
  conv.say(`[SCREEN] The new hire is saving ${fixed.invoice} with cost center ${fixed.cost_center}, asset ${fixed.asset_number}, approval ${fixed.approval}, status ${fixed.status}. This satisfies all guardrails. Confirm in one sentence using the expert's reason, and call record_mastery for the matching step with result "mastered".`);
  await conv.settle(2500, 15_000);
  conv.close();
  const agentText = conv.log.filter((x) => x.who === "agent").map((x) => x.text).join("\n");
  console.log(conv.log.filter((x) => x.who === "agent" || x.who === "tool").map((x) => `    ${x.who}: ${x.text.slice(0, 160)}`).join("\n"));
  const e = c.expect.teach;
  check("teach: tutor steps in before the save ('stop here')", /stop here|would stop/i.test(agentText) === e.stepsIn);
  check("teach: replay_moment called", tools.some((t) => t.name === "replay_moment") === e.replay);
  check("teach: record_mastery called", tools.some((t) => t.name === "record_mastery") === e.mastery);
  check("teach: tutor quotes the expert", /sabine said|expert said|she said|"/i.test(agentText));
}

async function main() {
  const dir = new URL("../eval/cases/", import.meta.url).pathname;
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as Case)
    .filter((c) => !only || c.id === only);
  for (const c of cases) {
    const { events, transcript } = await runCapture(c);
    const draft = await runWorkMap(c, events, transcript);
    const { transcript: debrief, confirmed } = await runDebrief(c, draft);
    const final = await runWorkMap(c, events, transcript, { debrief, previous: draft });
    const confirmedMap: WorkMap = { ...final, confirmedByExpert: Boolean(confirmed?.confirmed), corrections: confirmed?.corrections ? [confirmed.corrections] : [] };
    await runTeach(c, confirmedMap);
    if (writeDemo) {
      const framesDir = new URL("../../demo/frames/", import.meta.url).pathname;
      const frames = [...new Set(events.map((e) => e.frameId).filter(Boolean))].map((id) => {
        const f = `${framesDir}${id}.jpeg`;
        return existsSync(f) ? { id, t: events.find((e) => e.frameId === id)!.t, dataUrl: `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`, w: 1512, h: 805 } : null;
      });
      const session = { id: `demo-${c.id}`, startedAt: Date.now(), endedAt: Date.now(), events, frames: frames.filter(Boolean), transcript: [...transcript, ...debrief], workMap: confirmedMap };
      const out = new URL("../public/demo-session.json", import.meta.url).pathname;
      writeFileSync(out, JSON.stringify(session));
      console.log(`\nwrote ${out} (${Math.round(JSON.stringify(session).length / 1024)} KB, ${frames.filter(Boolean).length} frames)`);
    }
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed${failed.length ? `; FAILED: ${failed.map((f) => f.name).join(" · ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
