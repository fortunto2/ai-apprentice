// Structured generation with Gemini, wrapped in Effect: typed errors, retry, timeout.
// Schemas are Effect Schema (SGR cascades); JSON Schema is derived from them for constrained decoding.

import { GoogleGenAI } from "@google/genai";
import { Data, Duration, Effect, Schedule, Schema } from "effect";

export const VISION_MODEL = process.env.VISION_MODEL ?? "gemini-3.5-flash";
export const SYNTH_MODEL = process.env.SYNTH_MODEL ?? "gemini-3.5-flash";

export class LlmError extends Data.TaggedError("LlmError")<{ readonly stage: string; readonly cause: unknown }> {}
export class DecodeError extends Data.TaggedError("DecodeError")<{ readonly stage: string; readonly raw: string; readonly cause: unknown }> {}

let client: GoogleGenAI | null = null;
function gemini() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
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

export function generateStructured<S extends Schema.ConstraintDecoder<unknown>>(opts: {
  stage: string;
  model: string;
  schema: S;
  system: string;
  parts: Part[];
  temperature?: number;
  timeoutMs?: number;
}): Effect.Effect<S["Type"], LlmError | DecodeError> {
  const jsonSchema = toGeminiSchema(opts.schema);
  const decode = Schema.decodeUnknownSync(opts.schema);
  const call = Effect.tryPromise({
    try: () =>
      gemini().models.generateContent({
        model: opts.model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: opts.temperature ?? 0.2,
        },
      }),
    catch: (cause) => new LlmError({ stage: opts.stage, cause }),
  });
  return call.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(opts.timeoutMs ?? 25_000),
      orElse: () => Effect.fail(new LlmError({ stage: opts.stage, cause: "timeout" })),
    }),
    Effect.retry({ times: 2, schedule: Schedule.exponential("600 millis") }),
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
