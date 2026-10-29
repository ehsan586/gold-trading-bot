import { NextRequest, NextResponse } from "next/server";
import { ackCommand, findAccountByToken, pushAccountState, Mt4PositionReport } from "@/lib/mt4";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface PushBody {
  token?: string;
  balance?: number;
  equity?: number;
  currency?: string;
  positions?: Mt4PositionReport[];
  acks?: { commandId: number; ok: boolean; ticket?: number; fillPrice?: number; error?: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PushBody;
    if (!body.token) return NextResponse.json({ ok: false, error: "token required" }, { status: 401 });

    const account = await findAccountByToken(body.token);
    if (!account) return NextResponse.json({ ok: false, error: "unknown token" }, { status: 403 });

    await pushAccountState(
      account,
      { balance: body.balance, equity: body.equity, currency: body.currency },
      Array.isArray(body.positions) ? body.positions : []
    );

    for (const ack of body.acks ?? []) {
      if (typeof ack.commandId !== "number") continue;
      await ackCommand(account.id, ack.commandId, !!ack.ok, {
        ticket: ack.ticket,
        fillPrice: ack.fillPrice,
        error: ack.error,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }
}
