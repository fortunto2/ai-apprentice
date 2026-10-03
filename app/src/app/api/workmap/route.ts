import { NextResponse } from "next/server";
import { Effect, Schema as S } from "effect";
import { ScreenEvent, TranscriptLine, WorkMap } from "@/lib/schemas";
import { synthesizeWorkMap } from "@/server/workmap";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = S.Struct({
  events: S.Array(ScreenEvent),
  transcript: S.Array(TranscriptLine),
  debrief: S.optionalKey(S.Array(TranscriptLine)),
  previous: S.optionalKey(WorkMap),
  expertName: S.optionalKey(S.String),
});
const decodeBody = S.decodeUnknownSync(Body);

export async function POST(req: Request) {
  const body = decodeBody(await req.json());
  const result = await Effect.runPromise(
    synthesizeWorkMap(body).pipe(
      Effect.map((workMap) => ({ ok: true as const, workMap })),
      Effect.catch((e) => Effect.succeed({ ok: false as const, error: `${e._tag}: ${String("cause" in e ? e.cause : e)}`, raw: "raw" in e ? e.raw : undefined })),
    ),
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
