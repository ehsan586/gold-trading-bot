import { db } from "@/db";
import { learningState, strategies, trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { clamp } from "./indicators";

/* ------------------------------------------------------------------ */
/* Typed helpers over the learning_state key/value table               */
/* ------------------------------------------------------------------ */
export async function getLearning<T>(key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(learningState).where(eq(learningState.key, key)).limit(1);
  if (rows.length === 0) return fallback;
  return rows[0].value as T;
}

export async function setLearning(key: string, value: unknown): Promise<void> {
  await db
    .insert(learningState)
    .values({ key, value: value as never, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: learningState.key, set: { value: value as never, updatedAt: Date.now() } });
}

export const DEFAULT_AGENT_WEIGHTS: Record<string, number> = {
  technical: 1,
  strategy: 1,
  news: 1,
};

export const DEFAULT_INDICATOR_WEIGHTS: Record<string, number> = {
  rsi: 1,
  macd: 1,
  emaTrend: 1,
  bollinger: 1,
  stoch: 1,
  volume: 1,
};

export interface XpState {
  xp: number;
  tradesLearned: number;
  wins: number;
  losses: number;
}

export const DEFAULT_XP: XpState = { xp: 0, tradesLearned: 0, wins: 0, losses: 0 };

export function xpToLevel(xp: number): number {
  return Math.floor(Math.cbrt(xp)) + 1;
}

export function xpForNextLevel(level: number): number {
  return Math.pow(level, 3);
}

/* ================================================================== */
/* The core learning update — runs after every closed trade            */
/* ================================================================== */
export async function learnFromTrade(trade: typeof trades.$inferSelect): Promise<string[]> {
  const messages: string[] = [];
  if (trade.pnl == null) return messages;

  const won = trade.pnl > 0;
  const sideSign = trade.side === "long" ? 1 : -1;
  const reward = won ? 1 : -1;

  // -- 1) agent weights (multiplicative, bounded) ---------------------
  const agentWeights = await getLearning("agent_weights", { ...DEFAULT_AGENT_WEIGHTS });
  const votes = trade.votes ?? {};
  const deltas: string[] = [];
  for (const [agent, vote] of Object.entries(votes)) {
    const agreed = Math.sign(vote.signal) === sideSign ? 1 : -1;
    const lr = 0.07 * Math.abs(vote.signal) * (0.5 + vote.confidence);
    const old = agentWeights[agent] ?? 1;
    const next = clamp(old * Math.exp(lr * reward * agreed), 0.2, 3);
    agentWeights[agent] = +next.toFixed(4);
    const dir = next > old ? "↑" : next < old ? "↓" : "·";
    deltas.push(`${agent} ${dir}`);
  }
  await setLearning("agent_weights", agentWeights);

  // -- 2) indicator weights -------------------------------------------
  const indWeights = await getLearning("indicator_weights", { ...DEFAULT_INDICATOR_WEIGHTS });
  const subs = trade.subSignals ?? {};
  for (const [ind, sig] of Object.entries(subs)) {
    const agreed = Math.sign(sig) === sideSign ? 1 : -1;
    const lr = 0.05 * Math.abs(sig);
    const next = clamp((indWeights[ind] ?? 1) * Math.exp(lr * reward * agreed), 0.2, 3);
    indWeights[ind] = +next.toFixed(4);
  }
  await setLearning("indicator_weights", indWeights);

  // -- 3) strategy registry metrics ------------------------------------
  if (trade.strategyKey) {
    const rows = await db.select().from(strategies).where(eq(strategies.key, trade.strategyKey)).limit(1);
    if (rows.length > 0) {
      const s = rows[0];
      const tradesN = s.trades + 1;
      const wins = s.wins + (won ? 1 : 0);
      const lossesN = s.losses + (won ? 0 : 1);
      const grossWin = s.grossWin + (won ? trade.pnl : 0);
      const grossLoss = s.grossLoss + (won ? 0 : Math.abs(trade.pnl));
      const totalPnl = s.totalPnl + trade.pnl;
      const expectancy = totalPnl / tradesN;
      // weight = blend of win rate & profit factor, gently evolving
      const winRate = tradesN > 0 ? wins / tradesN : 0.5;
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 2 : 1;
      const score = clamp(0.55 * (winRate / 0.65) + 0.45 * clamp(pf / 2, 0, 1), 0.15, 2.2);
      await db
        .update(strategies)
        .set({
          trades: tradesN,
          wins,
          losses: lossesN,
          grossWin: +grossWin.toFixed(2),
          grossLoss: +grossLoss.toFixed(2),
          totalPnl: +totalPnl.toFixed(2),
          expectancy: +expectancy.toFixed(2),
          weight: +score.toFixed(3),
          updatedAt: Date.now(),
        })
        .where(eq(strategies.key, trade.strategyKey));
    }
  }

  // -- 4) XP / levels ---------------------------------------------------
  const xp = await getLearning("xp", { ...DEFAULT_XP });
  xp.xp += won ? 3 : 2; // losses teach almost as much as wins
  xp.tradesLearned += 1;
  if (won) xp.wins += 1;
  else xp.losses += 1;
  await setLearning("xp", xp);

  // -- 4b) timeframe weights --------------------------------------------
  const tfKey = (trade as { timeframe?: string | null }).timeframe ?? "m1";
  const tfWeights = await getLearning<Record<string, number>>("tf_weights", {
    m1: 1, m5: 1.1, m15: 1, h1: 1,
  });
  tfWeights[tfKey] = +clamp((tfWeights[tfKey] ?? 1) * Math.exp(0.06 * reward), 0.3, 2.5).toFixed(4);
  await setLearning("tf_weights", tfWeights);
  messages.push(
    `یادگیری تایم‌فریمی: عملکرد ${tfKey.toUpperCase()} ${won ? "تقویت" : "تنبیه"} شد (×${tfWeights[tfKey].toFixed(2)})`
  );

  // -- 4c) strategy memory per market regime -----------------------------
  if (trade.strategyKey && trade.regime) {
    const perf = await getLearning<Record<string, Record<string, { w: number; l: number }>>>(
      "strategy_regime_perf",
      {}
    );
    perf[trade.strategyKey] = perf[trade.strategyKey] ?? {};
    const cell = perf[trade.strategyKey][trade.regime] ?? { w: 0, l: 0 };
    if (won) cell.w += 1;
    else cell.l += 1;
    perf[trade.strategyKey][trade.regime] = cell;
    await setLearning("strategy_regime_perf", perf);
  }

  // -- 4d) loss-streak tracker for the risk cooldown ----------------------
  const riskState = await getLearning<{ lossStreak: number; cooldownUntil: number }>("risk_state", {
    lossStreak: 0,
    cooldownUntil: 0,
  });
  if (won) {
    riskState.lossStreak = 0;
  } else {
    riskState.lossStreak += 1;
    if (riskState.lossStreak >= 4 && riskState.cooldownUntil < Date.now()) {
      riskState.cooldownUntil = Date.now() + 30 * 60_000;
      messages.push("چهار باخت پیاپی — مدیر ریسک ۳۰ دقیقه کول‌داون اعلام کرد تا مدل تنفس کند");
    }
  }
  await setLearning("risk_state", riskState);

  // -- 5) calibration: predicted confidence vs realized outcome --------
  const calibration = await getLearning<{ conf: number; correct: boolean }[]>("calibration", []);
  const conf = Math.abs(trade.entryScore ?? 0);
  calibration.push({ conf: +conf.toFixed(3), correct: won });
  if (calibration.length > 200) calibration.shift();
  await setLearning("calibration", calibration);

  const agentFa = won ? "سود" : "زیان";
  messages.push(
    `معامله #${trade.id} با ${agentFa} ${trade.pnl.toFixed(0)}$ بسته شد — به‌روزرسانی وزن‌ها: ${deltas.join("، ")}`
  );
  return messages;
}

/* ================================================================== */
/* Rolling history helpers for charts                                  */
/* ================================================================== */
export async function pushScore(score: number): Promise<void> {
  const hist = await getLearning<number[]>("score_history", []);
  hist.push(+score.toFixed(3));
  if (hist.length > 300) hist.shift();
  await setLearning("score_history", hist);
}

export async function pushEquity(equity: number): Promise<void> {
  const hist = await getLearning<number[]>("equity_history", []);
  hist.push(Math.round(equity));
  if (hist.length > 300) hist.shift();
  await setLearning("equity_history", hist);
}
