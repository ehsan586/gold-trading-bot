import { NextResponse } from "next/server";
import { runTick } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    const result = await runTick(false);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await runTick(false);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 }
    );
  }
}
