import { NextRequest, NextResponse } from "next/server";
import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { getDbCandles, SYMBOL } from "@/lib/market";
import { ema, rsi, macd, bollinger } from "@/lib/indicators";
import { aggregateCandles, TfKey } from "@/lib/mtf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const tf = (req.nextUrl.searchParams.get("tf") ?? "m1") as TfKey;
    const tfMinutes = tf === "h1" ? 60 : tf === "m15" ? 15 : tf === "m5" ? 5 : 1;
    const raw = await getDbCandles(Math.min(1400, 240 * tfMinutes));
    const candles = aggregateCandles(raw, tfMinutes).slice(-240);
    if (candles.length < 5) {
      return NextResponse.json({ ok: true, empty: true, candles: [], markers: [] });
    }
    const closes = candles.map((c) => c.close);
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const { macd: macdLine, histogram } = macd(closes);
    const { upper, lower, mid } = bollinger(closes, 20, 2);

    const rangeStart = candles[0].ts;
    const recentTrades = await db
      .select()
      .from(trades)
      .where(gte(trades.openedAt, rangeStart * 1000))
      .orderBy(desc(trades.id))
      .limit(30);

    const markers: {
      time: number;
      position: "belowBar" | "aboveBar";
      color: string;
      shape: "arrowUp" | "arrowDown" | "circle";
      text: string;
    }[] = [];
    const bucket = tfMinutes * 60;
    for (const t of recentTrades) {
      const openSec = Math.floor(t.openedAt / 1000);
      if (openSec >= rangeStart) {
        markers.push({
          time: openSec - (openSec % bucket),
          position: t.side === "long" ? "belowBar" : "aboveBar",
          color: t.side === "long" ? "#34d399" : "#f87171",
          shape: t.side === "long" ? "arrowUp" : "arrowDown",
          text: t.side === "long" ? `خرید ${t.leverage}x` : `فروش ${t.leverage}x`,
        });
      }
      if (t.closedAt) {
        const closeSec = Math.floor(t.closedAt / 1000);
        if (closeSec >= rangeStart) {
          markers.push({
            time: closeSec - (closeSec % bucket),
            position: t.side === "long" ? "aboveBar" : "belowBar",
            color: (t.pnl ?? 0) >= 0 ? "#f7b32b" : "#94a3b8",
            shape: "circle",
            text: `خروج ${(t.pnl ?? 0) >= 0 ? "+" : ""}${(t.pnl ?? 0).toFixed(0)}$`,
          });
        }
      }
    }
    markers.sort((a, b) => a.time - b.time);
    const seen = new Set<string>();
    const deduped = markers.filter((m) => {
      const k = `${m.time}-${m.position}-${m.shape}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return NextResponse.json({
      ok: true,
      symbol: SYMBOL,
      candles,
      series: {
        ema20,
        ema50,
        rsi14,
        macd: macdLine,
        macdHist: histogram,
        bbUpper: upper,
        bbLower: lower,
        bbMid: mid,
      },
      markers: deduped,
      openTrade: (await db.select().from(trades).where(eq(trades.status, "open")).limit(1))[0] ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "chart failed" },
      { status: 500 }
    );
  }
}
