import { NextRequest, NextResponse } from "next/server";
import { findAccountByToken, pullCommands } from "@/lib/mt4";
import { runTick } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The MT4 EA calls this every N seconds with ?token=...
 * It doubles as an engine heartbeat so trading logic keeps running
 * even when the dashboard is closed — as long as the terminal is online.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "token required" }, { status: 401 });

  const account = await findAccountByToken(token);
  if (!account) return NextResponse.json({ ok: false, error: "unknown token" }, { status: 403 });
  if (!account.enabled) return NextResponse.json({ ok: true, enabled: false, commands: [] });

  const commands = await pullCommands(account.id);

  // engine heartbeat (gated internally to ≥8s between runs)
  void runTick(false).catch(() => null);

  return NextResponse.json({
    ok: true,
    enabled: true,
    serverTime: Date.now(),
    commands: commands.map((c) => ({ id: c.id, type: c.type, ...c.payload })),
  });
}
