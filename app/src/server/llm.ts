// Structured generation with Gemini, wrapped in Effect: typed errors, retry, timeout.
// Schemas are Effect Schema (SGR cascades); JSON Schema is derived from them for constrained decoding.

import { GoogleGenAI } from "@google/genai";
import { Data, Duration, Effect, Schedule, Schema } from "effect";

export const VISION_MODEL = process.env.VISION_MODEL ?? "gemini-2.5-flash";
export const SYNTH_MODEL = process.env.SYNTH_MODEL ?? "gemini-2.5-flash";

export class LlmError extends Data.TaggedError("LlmError")<{ readonly stage: string; readonly cause: unknown }> {}
export class DecodeError extends Data.TaggedError("DecodeError")<{ readonly stage: string; readonly raw: string; readonly cause: unknown }> {}

// Free-tier quotas are per key and per model, so a 429 rotates to the next key, then the next model.
function keys(override?: string): string[] {
  // A visitor's own key never falls through to the shared ones: their quota, their problem.
  if (override) return [override];
  const k = [process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY, process.env.GEMINI_API_KEY_2].filter((x): x is string => Boolean(x));
  if (!k.length) throw new Error("GEMINI_API_KEY missing");
  return [...new Set(k)];
}
const MODEL_FALLBACKS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const isQuota = (e: unknown) => (e as { status?: number } | null)?.status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(String(e));

async function generateWithRotation(model: string, req: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">, override?: string) {
  let last: unknown;
  for (const m of [model, ...MODEL_FALLBACKS.filter((x) => x !== model)]) {
    for (const key of keys(override)) {
      try {
        return await new GoogleGenAI({ apiKey: key }).models.generateContent({ ...req, model: m });
      } catch (e) {
        last = e;
        if (!isQuota(e)) throw e;
        console.warn(`[llm] quota on ${m} with key …${key.slice(-4)}, rotating`);
      }
    }
  }
  throw last;
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export function dataUrlToInline(dataUrl: string): Part {
  const [head, data] = dataUrl.split(",");
  const mimeType = head.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  return { inlineData: { mimeType, data } };
}

// Gemini accepts a JSON Schema subset; strip the draft wrapper and $schema key.
export function toGeminiSchema<S extends Schema.ConstraintDecoder<unknown>>(schema: S): Record<string, unknown> {
  const doc = Schema.toJsonSchemaDocument(schema);
  const defs = Object.keys(doc.definitions ?? {}).length ? { $defs: doc.definitions } : {};
  return { ...(doc.schema as Record<string, unknown>), ...defs };
}

// JSON Schema and decoder per schema object, compiled once.
const compiled = new WeakMap<object, { jsonSchema: Record<string, unknown>; decode: (u: unknown) => unknown }>();
function compile<S extends Schema.ConstraintDecoder<unknown>>(schema: S) {
  let c = compiled.get(schema);
  if (!c) {
    c = { jsonSchema: toGeminiSchema(schema), decode: Schema.decodeUnknownSync(schema) };
    compiled.set(schema, c);
  }
  return c;
}

export function generateStructured<S extends Schema.ConstraintDecoder<unknown>>(opts: {
  stage: string;
  model: string;
  schema: S;
  system: string;
  parts: Part[];
  temperature?: number;
  timeoutMs?: number;
  apiKey?: string;
}): Effect.Effect<S["Type"], LlmError | DecodeError> {
  const { jsonSchema, decode } = compile(opts.schema);
  const call = Effect.tryPromise({
    try: () =>
      generateWithRotation(opts.model, {
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: opts.temperature ?? 0.2,
        },
      }, opts.apiKey),
    catch: (cause) => new LlmError({ stage: opts.stage, cause }),
  });
  return call.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(opts.timeoutMs ?? 25_000),
      orElse: () => Effect.fail(new LlmError({ stage: opts.stage, cause: "timeout" })),
    }),
    // Quota is handled by the rotation above; one retry covers a transient network error.
    Effect.retry({ times: 1, schedule: Schedule.exponential("600 millis"), while: (e) => !isQuota(e.cause) }),
    Effect.flatMap((res) => {
      const raw = res.text ?? "";
      return Effect.try({
        try: () => decode(JSON.parse(raw)) as S["Type"],
        catch: (cause) => new DecodeError({ stage: opts.stage, raw, cause }),
      });
    }),
    Effect.withSpan(`llm.${opts.stage}`),
  );
}
