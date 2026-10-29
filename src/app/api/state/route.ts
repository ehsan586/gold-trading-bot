import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentLogs, signals, strategies, trades } from "@/db/schema";
import { getSettings } from "@/lib/engine";
import { getDbCandles } from "@/lib/market";
import { recentNews } from "@/lib/news";
import { getLearning, xpToLevel, xpForNextLevel, DEFAULT_AGENT_WEIGHTS, DEFAULT_INDICATOR_WEIGHTS } from "@/lib/learning";
import { sessionInfo } from "@/lib/agents";
import { listAccounts, listPositions, listRecentCommands } from "@/lib/mt4";

export const dynamic = "force-dynamic";

interface XpState {
  xp: number;
  tradesLearned: number;
  wins: number;
  losses: number;
}

export async function GET() {
  try {
    const s = await getSettings();
    const candlesRows = await getDbCandles(2);
    const lastPrice = candlesRows[candlesRows.length - 1]?.close ?? null;
    const prevPrice = candlesRows[candlesRows.length - 2]?.close ?? lastPrice;

    const openTrades = await db.select().from(trades).where(eq(trades.status, "open"));
    const closedTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.status, "closed"))
      .orderBy(desc(trades.id))
      .limit(30);

    let unrealized = 0;
    for (const t of openTrades) {
      if (!lastPrice) continue;
      unrealized += (t.side === "long" ? lastPrice - t.entryPrice : t.entryPrice - lastPrice) * t.qtyOz;
    }
    const equity = s.balance + unrealized;
    const dayPnlPct =
      s.dayStartEquity > 0 ? ((equity - s.dayStartEquity) / s.dayStartEquity) * 100 : 0;

    const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    const allClosedCount = closedTrades.length;
    const grossWin = closedTrades.filter((t) => (t.pnl ?? 0) > 0).reduce((a, t) => a + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(closedTrades.filter((t) => (t.pnl ?? 0) < 0).reduce((a, t) => a + (t.pnl ?? 0), 0));
    const totalPnl = closedTrades.reduce((a, t) => a + (t.pnl ?? 0), 0);

    const latestSignals = await db.select().from(signals).orderBy(desc(signals.id)).limit(24);
    const byAgent: Record<string, (typeof latestSignals)[number]> = {};
    for (const sig of latestSignals) if (!byAgent[sig.agent]) byAgent[sig.agent] = sig;

    const logsRows = await db.select().from(agentLogs).orderBy(desc(agentLogs.id)).limit(45);
    const newsRows = await recentNews(12, 18);
    const stratRows = await db.select().from(strategies);

    const agentWeights = await getLearning("agent_weights", { ...DEFAULT_AGENT_WEIGHTS });
    const indicatorWeights = await getLearning("indicator_weights", { ...DEFAULT_INDICATOR_WEIGHTS });
    const xp = await getLearning<XpState>("xp", { xp: 0, tradesLearned: 0, wins: 0, losses: 0 });
    const calibration = await getLearning<{ conf: number; correct: boolean }[]>("calibration", []);
    const scoreHistory = await getLearning<number[]>("score_history", []);
    const equityHistory = await getLearning<number[]>("equity_history", []);

    const level = xpToLevel(xp.xp);
    const levelBase = xpForNextLevel(level - 1);
    const levelNext = xpForNextLevel(level);

    // multi-timeframe brain state + MT4 bridge state
    const mtfState = await getLearning<Record<string, unknown>>("mtf_state", {});
    const riskState = await getLearning<{ lossStreak: number; cooldownUntil: number }>("risk_state", {
      lossStreak: 0,
      cooldownUntil: 0,
    });
    const mt4Accs = await listAccounts();
    const mt4 = await Promise.all(
      mt4Accs.map(async (a) => ({
        id: a.id,
        login: a.login,
        server: a.server,
        token: a.token,
        enabled: a.enabled,
        balance: a.balance,
        equity: a.equity,
        currency: a.currency,
        lastSeen: a.lastSeen,
        online: a.lastSeen != null && Date.now() - a.lastSeen < 90_000,
        positions: await listPositions(a.id),
        commands: await listRecentCommands(a.id, 6),
      }))
    );

    return NextResponse.json({
      ok: true,
      price: { last: lastPrice, change: lastPrice && prevPrice ? lastPrice - prevPrice : 0, ts: candlesRows[candlesRows.length - 1]?.ts ?? null },
      settings: {
        autoTrading: s.autoTrading,
        riskPct: s.riskPct,
        maxLeverage: s.maxLeverage,
        maxDailyLossPct: s.maxDailyLossPct,
        entryThreshold: s.entryThreshold,
        killSwitchOn: s.killSwitchOn,
      },
      account: {
        balance: s.balance,
        equity,
        startBalance: s.startBalance,
        dayPnlPct,
        unrealized,
        totalPnl,
      },
      stats: {
        closedCount: allClosedCount,
        winRate: allClosedCount > 0 ? wins / allClosedCount : 0,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
      },
      openTrades,
      closedTrades,
      signals: byAgent,
      logs: logsRows.reverse(),
      news: newsRows,
      strategies: stratRows,
      learning: {
        agentWeights,
        indicatorWeights,
        xp,
        level,
        levelProgress: levelNext > levelBase ? (xp.xp - levelBase) / (levelNext - levelBase) : 0,
        calibration: calibration.slice(-60),
        scoreHistory,
        equityHistory,
      },
      session: sessionInfo(),
      mtf: mtfState,
      riskState,
      mt4,
      serverTime: Date.now(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "state failed" },
      { status: 500 }
    );
  }
}
