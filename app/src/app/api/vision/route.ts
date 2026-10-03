import { NextResponse } from "next/server";
import { Effect, Schema as S } from "effect";
import { describeFrameChange } from "@/server/vision";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = S.Struct({
  prev: S.NullOr(S.String),
  curr: S.String,
  recent: S.optionalKey(S.Array(S.String)),
});
const decodeBody = S.decodeUnknownSync(Body);

export async function POST(req: Request) {
  const body = decodeBody(await req.json());
  const result = await Effect.runPromise(
    describeFrameChange({ prev: body.prev, curr: body.curr, recent: body.recent ?? [] }).pipe(
      Effect.map((r) => ({ ok: true as const, ...r })),
      Effect.catch((e) => Effect.succeed({ ok: false as const, error: `${e._tag}: ${String("cause" in e ? e.cause : e)}` })),
    ),
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
