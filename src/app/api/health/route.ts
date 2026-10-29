import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    // the file:// launcher page probes this endpoint — allow it
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
