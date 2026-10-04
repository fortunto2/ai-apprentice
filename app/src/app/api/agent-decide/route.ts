import { NextResponse } from "next/server";
import { Effect, Schema as S } from "effect";
import { keysFromRequest } from "@/lib/byok-headers";
import { WorkMap } from "@/lib/schemas";
import { AGENT_INVOICES } from "@/lib/erp-data";
import { decideInvoice } from "@/server/agent-decide";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = S.Struct({ workMap: WorkMap, invoiceId: S.String });
const decodeBody = S.decodeUnknownSync(Body);

export async function POST(req: Request) {
  const body = decodeBody(await req.json());
  const invoice = AGENT_INVOICES.find((i) => i.id === body.invoiceId);
  if (!invoice) return NextResponse.json({ ok: false, error: "unknown invoice" }, { status: 400 });
  const result = await Effect.runPromise(
    decideInvoice({ workMap: body.workMap, invoice, apiKey: keysFromRequest(req).gemini }).pipe(
      Effect.map((decision) => ({ ok: true as const, decision })),
      Effect.catch((e) => Effect.succeed({ ok: false as const, error: `${e._tag}: ${String("cause" in e ? e.cause : e)}` })),
    ),
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
