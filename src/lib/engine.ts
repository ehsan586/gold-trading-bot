import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { agentLogs, settings, signals, strategies, trades } from "@/db/schema";
import { SPREAD, getDbCandles, pruneCandles, seedSyntheticHistoryIfEmpty, syncMarketData } from "./market";
import { STRATEGY_DEFS } from "./strategies";
import {
  technicalAnalyst,
  strategyScout,
  newsWatchtower,
  portfolioManager,
  riskManager,
  sessionInfo,
  AgentOutput,
} from "./agents";
import { buildTfStack, selectTimeframe, DEFAULT_TF_WEIGHTS, TF_LABEL_FA, TfKey } from "./mtf";
import { aggregateNewsSignal, fetchAndStoreNews, recentNews } from "./news";
import {
  DEFAULT_AGENT_WEIGHTS,
  DEFAULT_INDICATOR_WEIGHTS,
  getLearning,
  learnFromTrade,
  pushEquity,
  pushScore,
  setLearning,
} from "./learning";
import { clamp } from "./indicators";
import { enqueueOpenCommands, enqueueCloseCommands } from "./mt4";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
export type Settings = typeof settings.$inferSelect;

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows.length > 0) return rows[0];
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const again = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return again[0];
}

export async function ensureStrategiesSeeded(): Promise<void> {
  const existing = await db.select({ key: strategies.key }).from(strategies);
  if (existing.length >= STRATEGY_DEFS.length) return;
  for (const def of STRATEGY_DEFS) {
    await db
      .insert(strategies)
      .values({ key: def.key, nameFa: def.nameFa, nameEn: def.nameEn, descFa: def.descFa, weight: 1, updatedAt: Date.now() })
      .onConflictDoNothing();
  }
}

/* ------------------------------------------------------------------ */
/* Logging + housekeeping helpers                                      */
/* ------------------------------------------------------------------ */
export async function logAgent(agent: string, kind: string, messageFa: string): Promise<void> {
  await db.insert(agentLogs).values({ agent, kind, messageFa, createdAt: Date.now() });
}

async function pruneTable(
  idCol: typeof signals.id | typeof agentLogs.id,
  keep: number,
  table: typeof signals | typeof agentLogs
): Promise<void> {
  const cutoff = await db.select({ id: idCol }).from(table).orderBy(desc(idCol)).offset(keep).limit(1);
  if (cutoff.length === 0) return;
  const { lt } = await import("drizzle-orm");
  await db.delete(table).where(lt(idCol, cutoff[0].id));
}

async function recordSignal(agent: string, out: AgentOutput): Promise<void> {
  await db.insert(signals).values({
    agent,
    signal: out.signal,
    confidence: out.confidence,
    summaryFa: out.summaryFa,
    details: out.details ?? {},
    createdAt: Date.now(),
  });
}

function utcDayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function unrealizedFor(trade: typeof trades.$inferSelect, price: number): number {
  const diff = trade.side === "long" ? price - trade.entryPrice : trade.entryPrice - price;
  return diff * trade.qtyOz + (trade.realizedPnl ?? 0);
}

/** Dynamic entry threshold driven by model calibration. */
function dynamicThreshold(base: number, calibration: { conf: number; correct: boolean }[]): {
  threshold: number;
  note: string | null;
} {
  const recent = calibration.slice(-40);
  if (recent.length < 12) return { threshold: base, note: null };
  const hi = recent.filter((c) => c.conf >= 0.45);
  if (hi.length < 8) return { threshold: base, note: null };
  const acc = hi.filter((c) => c.correct).length / hi.length;
  if (acc < 0.45) return { threshold: clamp(base + 0.08, 0.25, 0.7), note: `کالیبراسیون ضعیف (${(acc * 100).toFixed(0)}٪ در اطمینان بالا) — آستانه ورود سخت‌گیرانه‌تر شد` };
  if (acc > 0.62) return { threshold: clamp(base - 0.04, 0.25, 0.7), note: `کالیبراسیون قوی (${(acc * 100).toFixed(0)}٪) — مدل اجازه ورود با آستانه روان‌تر دارد` };
  return { threshold: base, note: null };
}

/* ================================================================== */
/* One full company meeting                                            */
/* ================================================================== */
export async function runTick(force = false): Promise<{
  ok: boolean;
  skipped?: boolean;
  summary?: string;
  price?: number;
  source?: string;
}> {
  const s = await getSettings();
  const now = Date.now();
  if (!force && now - s.lastTick < 8000) return { ok: true, skipped: true };

  await ensureStrategiesSeeded();

  /* 1. market -------------------------------------------------------- */
  const market = await syncMarketData().catch(() => null);
  if (!market || market.source === "synthetic") await seedSyntheticHistoryIfEmpty();
  const candlesRows = await getDbCandles(1400);
  if (candlesRows.length < 60) return { ok: false, summary: "waiting for candle history" };
  const price = candlesRows[candlesRows.length - 1].close;

  /* 1b. multi-timeframe stack + intelligent switcher ------------------- */
  const indicatorWeights = await getLearning("indicator_weights", { ...DEFAULT_INDICATOR_WEIGHTS });
  const tfWeights = await getLearning("tf_weights", { ...DEFAULT_TF_WEIGHTS });
  const stack = buildTfStack(candlesRows, indicatorWeights);
  const selection = selectTimeframe(stack, tfWeights);
  const activeTf = stack.find((t) => t.key === selection.selected)!;
  const snap = activeTf.snapshot;

  const prevMtf = await getLearning<{ selected?: string }>("mtf_state", {});
  if (prevMtf.selected && prevMtf.selected !== selection.selected) {
    await logAgent(
      "technical",
      "decision",
      `تغییر تایم‌لاین عملیات: ${TF_LABEL_FA[prevMtf.selected as TfKey] ?? prevMtf.selected} ← ${TF_LABEL_FA[selection.selected]}. ${selection.reasonFa}`
    );
  }
  await setLearning("mtf_state", {
    selected: selection.selected,
    reasonFa: selection.reasonFa,
    h1Direction: selection.h1Direction,
    scores: selection.scores,
    per: Object.fromEntries(
      stack.map((t) => [
        t.key,
        {
          signal: t.signal,
          confidence: t.confidence,
          trend: t.snapshot.trend,
          regime: t.snapshot.regime,
          weight: tfWeights[t.key] ?? 1,
          bars: t.bars,
        },
      ])
    ),
    updatedAt: now,
  });

  /* 2. news ------------------------------------------------------------ */
  const st = await getSettings();
  if (now - st.lastNewsFetch > 4 * 60_000) {
    try {
      const newsInserted = await fetchAndStoreNews();
      await db.update(settings).set({ lastNewsFetch: now }).where(eq(settings.id, 1));
      if (newsInserted > 0) {
        await logAgent("news", "news", `${newsInserted} خبر تازه از آمریکا/ایندونزی/جهان دریافت و امتیازدهی شد`);
      }
    } catch {
      await db.update(settings).set({ lastNewsFetch: now }).where(eq(settings.id, 1));
    }
  }
  const newsRows = await recentNews(12, 25);
  const newsAgg = aggregateNewsSignal(newsRows);

  /* 3. agents ------------------------------------------------------------ */
  const agentWeights = await getLearning("agent_weights", { ...DEFAULT_AGENT_WEIGHTS });
  const regimePerf = await getLearning<Record<string, Record<string, { w: number; l: number }>>>(
    "strategy_regime_perf",
    {}
  );
  const stratRows = await db.select().from(strategies);
  const stratMetrics: Record<string, { weight: number; winRate: number; trades: number }> = {};
  for (const r of stratRows) {
    stratMetrics[r.key] = { weight: r.weight, winRate: r.trades > 0 ? r.wins / r.trades : 0.5, trades: r.trades };
  }

  const session = sessionInfo();
  const tech = technicalAnalyst(snap, indicatorWeights);
  const strat = strategyScout(snap, stratMetrics, regimePerf);
  const news = newsWatchtower(newsAgg);

  await recordSignal("technical", { ...tech, summaryFa: `[${selection.selected.toUpperCase()}] ${tech.summaryFa}` });
  await recordSignal("strategy", strat);
  await recordSignal("news", news);

  /* 4. dynamic threshold + portfolio decision ----------------------------- */
  const calibration = await getLearning<{ conf: number; correct: boolean }[]>("calibration", []);
  const dt = dynamicThreshold(st.entryThreshold, calibration);
  if (dt.note) await logAgent("learning", "learn", `آستانه پویا: ${dt.note} (آستانه فعلی ${dt.threshold.toFixed(2)})`);
  const decision = portfolioManager(tech, strat, news, session, agentWeights, dt.threshold);

  /* 5. day state / equity -------------------------------------------------- */
  const openTrades = await db.select().from(trades).where(eq(trades.status, "open"));
  let unrealized = 0;
  for (const t of openTrades) unrealized += unrealizedFor(t, price);
  const equity = st.balance + unrealized;
  const dayStamp = utcDayStamp();
  let dayStartEquity = st.dayStartEquity;
  if (st.dayStamp !== dayStamp) {
    dayStartEquity = equity;
    await db.update(settings).set({ dayStamp, dayStartEquity: equity, killSwitchOn: false }).where(eq(settings.id, 1));
    await logAgent("risk", "risk", "روز معاملاتی جدید آغاز شد — شمارنده ضرر روزانه صفر شد");
  }
  const dayPnlPct = dayStartEquity > 0 ? ((equity - dayStartEquity) / dayStartEquity) * 100 : 0;

  /* 6. risk & leverage ------------------------------------------------------ */
  const riskState = await getLearning<{ lossStreak: number; cooldownUntil: number }>("risk_state", {
    lossStreak: 0,
    cooldownUntil: 0,
  });
  const risk = riskManager({
    decision,
    snapshot: snap,
    balance: st.balance,
    riskPct: st.riskPct,
    maxLeverage: st.maxLeverage,
    killSwitchOn: st.killSwitchOn,
    dayPnlPct,
    maxDailyLossPct: st.maxDailyLossPct,
    newsSignal: newsAgg.signal,
    cooldownUntil: riskState.cooldownUntil,
  });
  if (risk.reason === "kill_switch" && !st.killSwitchOn) {
    await db.update(settings).set({ killSwitchOn: true }).where(eq(settings.id, 1));
    await logAgent("risk", "risk", risk.summaryFa);
  }

  /* 7. manage open trades ---------------------------------------------------- */
  const balanceState = { balance: st.balance };
  for (const t of openTrades) {
    await manageOpenTrade(t, snap, decision.score, price, balanceState);
  }

  /* 8. entries (single net position) ------------------------------------------ */
  const stillOpen = await db.select().from(trades).where(eq(trades.status, "open")).limit(1);
  let h1Veto = false;
  if (decision.direction !== "flat" && selection.h1Direction !== 0) {
    const dirSign = decision.direction === "long" ? 1 : -1;
    if (dirSign !== selection.h1Direction && Math.abs(decision.score) < 0.75) h1Veto = true;
  }
  if (h1Veto) {
    await logAgent(
      "portfolio",
      "decision",
      `وتو H1: سیگنال ${decision.direction === "long" ? "خرید" : "فروش"} خلاف جهت کامپاس کلان بود و قدرت کافی برای وتو نداشت — ورود لغو شد`
    );
  }
  if (st.autoTrading && !h1Veto && stillOpen.length === 0 && decision.direction !== "flat" && risk.allowed) {
    const side = decision.direction;
    const entry = side === "long" ? price + SPREAD / 2 : price - SPREAD / 2;
    const stopLoss = side === "long" ? entry - risk.stopDistance : entry + risk.stopDistance;
    const takeProfit = side === "long" ? entry + risk.takeProfitDistance : entry - risk.takeProfitDistance;
    const inserted = await db
      .insert(trades)
      .values({
        side,
        status: "open",
        entryPrice: +entry.toFixed(2),
        qtyOz: risk.qtyOz,
        leverage: risk.leverage,
        stopLoss: +stopLoss.toFixed(2),
        takeProfit: +takeProfit.toFixed(2),
        highestSinceEntry: entry,
        lowestSinceEntry: entry,
        openedAt: now,
        entryScore: decision.score,
        strategyKey: strat.chosen,
        regime: snap.regime,
        timeframe: selection.selected,
        votes: decision.votes,
        subSignals: tech.subSignals,
      })
      .returning({ id: trades.id });
    const tradeId = inserted[0]?.id;
    await logAgent(
      "portfolio",
      "trade",
      `ورود ${side === "long" ? "خرید" : "فروش"} ${risk.qtyOz.toFixed(2)} اونس @ ${entry.toFixed(2)} [${selection.selected.toUpperCase()}] | اهرم ${risk.leverage}x | حد ضرر ${stopLoss.toFixed(1)} / حد سود ${takeProfit.toFixed(1)} | استراتژی: ${strat.chosenNameFa}`
    );
    // mirror to MT4 bridge accounts
    if (tradeId) {
      const n = await enqueueOpenCommands(tradeId, side, risk.qtyOz, stopLoss, takeProfit, selection.selected);
      if (n > 0) await logAgent("portfolio", "trade", `فرمان اجرا برای ${n} حساب متاتریدر ۴ صادر شد (آلپاری)`);
    }
  }

  /* 9. learning ingest --------------------------------------------------------- */
  const processed = await getLearning<number>("learned_until_trade", 0);
  const newlyClosed = await db
    .select()
    .from(trades)
    .where(and(eq(trades.status, "closed"), gte(trades.id, processed + 1)))
    .orderBy(trades.id)
    .limit(20);
  let maxId = processed;
  for (const t of newlyClosed) {
    maxId = Math.max(maxId, t.id);
    const msgs = await learnFromTrade(t);
    for (const m of msgs) await logAgent("learning", "learn", m);
  }
  if (maxId > processed) await setLearning("learned_until_trade", maxId);

  /* 10. rolling series + housekeeping ------------------------------------------ */
  await pushScore(decision.score);
  await pushEquity(equity);
  await pruneCandles(1400);
  await pruneTable(signals.id, 1200, signals);
  await pruneTable(agentLogs.id, 500, agentLogs);

  /* 11. meeting minutes ---------------------------------------------------------- */
  await recordSignal("portfolio", {
    agent: "portfolio",
    signal: decision.score,
    confidence: decision.confidence,
    summaryFa: decision.summaryFa,
    details: { votes: decision.votes, direction: decision.direction, timeframe: selection.selected },
  });
  await recordSignal("risk", {
    agent: "risk",
    signal: decision.score,
    confidence: decision.confidence,
    summaryFa: risk.summaryFa,
    details: { leverage: risk.leverage, qtyOz: risk.qtyOz, volState: risk.volState, cooldown: risk.reason === "cooldown" },
  });
  await logAgent("portfolio", "decision", `[${selection.selected.toUpperCase()}] ${decision.summaryFa}`);
  if (risk.reason !== "no_signal") await logAgent("risk", "risk", risk.summaryFa);

  await db.update(settings).set({ lastTick: now }).where(eq(settings.id, 1));

  return { ok: true, summary: decision.summaryFa, price, source: market?.source };
}

/* ------------------------------------------------------------------ */
/* Open-trade management: partial TP + trailing + exits                 */
/* ------------------------------------------------------------------ */
async function manageOpenTrade(
  t: typeof trades.$inferSelect,
  snap: ReturnType<typeof buildTfStack>[number]["snapshot"],
  aggregateScore: number,
  price: number,
  balanceState: { balance: number }
): Promise<void> {
  const isLong = t.side === "long";
  const now = Date.now();

  const hi = Math.max(t.highestSinceEntry ?? t.entryPrice, price);
  const lo = Math.min(t.lowestSinceEntry ?? t.entryPrice, price);
  const rDist = Math.abs(t.entryPrice - (t.stopLoss ?? t.entryPrice)) || snap.atrValue * 1.5;
  const profitNow = isLong ? price - t.entryPrice : t.entryPrice - price;

  /* -- partial take-profit at +1R: bank half, move stop to breakeven -- */
  if (!t.tp1Done && profitNow >= rDist && t.qtyOz >= 0.02) {
    const half = Math.floor((t.qtyOz / 2) * 100) / 100;
    if (half >= 0.01 && t.qtyOz - half >= 0.01) {
      const realized = half * profitNow;
      const beStop = +(isLong ? t.entryPrice + rDist * 0.1 : t.entryPrice - rDist * 0.1).toFixed(2);
      const newStop = isLong ? Math.max(t.stopLoss ?? 0, beStop) : Math.min(t.stopLoss ?? Infinity, beStop);
      await db
        .update(trades)
        .set({
          qtyOz: t.qtyOz - half,
          realizedPnl: +((t.realizedPnl ?? 0) + realized).toFixed(2),
          tp1Done: true,
          stopLoss: +newStop.toFixed(2),
        })
        .where(eq(trades.id, t.id));
      balanceState.balance += realized;
      await db.update(settings).set({ balance: +balanceState.balance.toFixed(2) }).where(eq(settings.id, 1));
      await logAgent(
        "risk",
        "trade",
        `تی‌پی پلکانی فعال شد (#${t.id}) — نصف پوزیشن در +1R با سود ${realized.toFixed(0)}$ نقد شد و حد ضرر به نقطه سر‌به‌سر منتقل شد`
      );
      t.qtyOz -= half;
      t.stopLoss = newStop;
      t.tp1Done = true;
    }
  }

  /* -- trailing stop --------------------------------------------------- */
  let stop = t.stopLoss ?? 0;
  if (profitNow > rDist) {
    const trail = isLong ? hi - snap.atrValue * 1.2 : lo + snap.atrValue * 1.2;
    stop = isLong
      ? Math.max(stop, trail, t.entryPrice + rDist * 0.25)
      : Math.min(stop || Infinity, trail, t.entryPrice - rDist * 0.25);
  }
  await db
    .update(trades)
    .set({ highestSinceEntry: hi, lowestSinceEntry: lo, stopLoss: +stop.toFixed(2) })
    .where(eq(trades.id, t.id));

  /* -- exits ------------------------------------------------------------ */
  let exitPrice: number | null = null;
  let reason: string | null = null;
  const lastBar = snap.candles[snap.candles.length - 1];
  const hitStop = isLong ? lastBar.low <= stop : lastBar.high >= stop;
  const hitTarget = t.takeProfit != null && (isLong ? lastBar.high >= t.takeProfit : lastBar.low <= t.takeProfit);

  if (hitStop) {
    exitPrice = stop + (isLong ? -0.15 : 0.15);
    reason = profitNow >= 0 ? "trailing" : "stop";
  } else if (hitTarget) {
    exitPrice = t.takeProfit;
    reason = "target";
  } else if (Math.sign(aggregateScore) === -(isLong ? 1 : -1) && Math.abs(aggregateScore) > 0.5) {
    exitPrice = price + (isLong ? -SPREAD / 2 : SPREAD / 2);
    reason = "signal_flip";
  } else if (now - t.openedAt > 90 * 60_000 && profitNow < rDist * 0.2) {
    exitPrice = price + (isLong ? -SPREAD / 2 : SPREAD / 2);
    reason = "timeout";
  }

  if (exitPrice == null || reason == null) return;
  await finalizeClose(t, exitPrice, reason, balanceState);
}

/** Shared close finalization: accounting + MT4 close queue + log. */
async function finalizeClose(
  t: typeof trades.$inferSelect,
  exitPrice: number,
  reason: string,
  balanceState: { balance: number }
): Promise<void> {
  const isLong = t.side === "long";
  const now = Date.now();
  const remaining = (isLong ? exitPrice - t.entryPrice : t.entryPrice - exitPrice) * t.qtyOz;
  const pnl = remaining + (t.realizedPnl ?? 0);
  const notional = t.entryPrice * t.qtyOz;
  const pnlPct = (pnl / (notional || 1)) * 100 * t.leverage;
  const newBalance = balanceState.balance + remaining;
  balanceState.balance = newBalance;

  await db
    .update(trades)
    .set({
      status: "closed",
      exitPrice: +exitPrice.toFixed(2),
      closedAt: now,
      pnl: +pnl.toFixed(2),
      pnlPct: +pnlPct.toFixed(3),
      exitReason: reason,
    })
    .where(eq(trades.id, t.id));
  await db.update(settings).set({ balance: +newBalance.toFixed(2) }).where(eq(settings.id, 1));

  if (t.mt4Ticket != null) await enqueueCloseCommands(t.id, t.mt4Ticket);

  const reasonFa: Record<string, string> = {
    stop: "حد ضرر", trailing: "تریلینگ استاپ", target: "حد سود",
    signal_flip: "چرخش سیگنال", timeout: "پایان زمان معامله", manual: "دستی", kill_switch: "کلید اضطراری",
  };
  await logAgent(
    "portfolio",
    "trade",
    `خروج ${isLong ? "خرید" : "فروش"} #${t.id} @ ${exitPrice.toFixed(2)} — دلیل: ${reasonFa[reason] ?? reason} — ${
      pnl >= 0 ? "سود" : "زیان"
    } ${pnl.toFixed(0)}$ (${pnlPct.toFixed(1)}٪ با اهرم)`
  );
}

/* ------------------------------------------------------------------ */
/* Manual operations                                                     */
/* ------------------------------------------------------------------ */
export async function closeOpenTrades(reason = "manual"): Promise<number> {
  const open = await db.select().from(trades).where(eq(trades.status, "open"));
  const candlesRows = await getDbCandles(5);
  const price = candlesRows[candlesRows.length - 1]?.close ?? 0;
  let count = 0;
  const s = await getSettings();
  const balanceState = { balance: s.balance };
  for (const t of open) {
    const isLong = t.side === "long";
    const exitPrice = price + (isLong ? -SPREAD / 2 : SPREAD / 2);
    await finalizeClose(t, exitPrice, reason, balanceState);
    count++;
  }
  return count;
}

export async function resetFund(): Promise<void> {
  await db.delete(trades);
  await db.delete(signals);
  await db.delete(agentLogs);
  await db.delete(strategies);
  await setLearning("agent_weights", { ...DEFAULT_AGENT_WEIGHTS });
  await setLearning("indicator_weights", { ...DEFAULT_INDICATOR_WEIGHTS });
  await setLearning("tf_weights", { ...DEFAULT_TF_WEIGHTS });
  await setLearning("strategy_regime_perf", {});
  await setLearning("risk_state", { lossStreak: 0, cooldownUntil: 0 });
  await setLearning("mtf_state", {});
  await setLearning("xp", { xp: 0, tradesLearned: 0, wins: 0, losses: 0 });
  await setLearning("calibration", []);
  await setLearning("score_history", []);
  await setLearning("equity_history", []);
  await setLearning("learned_until_trade", 0);
  await db
    .update(settings)
    .set({
      balance: 100000,
      startBalance: 100000,
      dayStartEquity: 100000,
      dayStamp: utcDayStamp(),
      killSwitchOn: false,
      lastTick: 0,
      lastNewsFetch: 0,
    })
    .where(eq(settings.id, 1));
  await ensureStrategiesSeeded();
  await logAgent("learning", "learn", "بازنشانی کامل صندوق انجام شد — مغز یادگیری به حالت اولیه برگشت");
  await pushEquity(100000);
  await pushScore(0);
}
