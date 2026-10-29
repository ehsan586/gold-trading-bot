import { Snapshot, STRATEGY_DEFS, StrategyResult } from "./strategies";
import { last, clamp } from "./indicators";

/* ------------------------------------------------------------------ */
/* Agent primitives                                                    */
/* ------------------------------------------------------------------ */
export interface AgentOutput {
  agent: string;
  signal: number; // -1..1 (bearish..bullish)
  confidence: number; // 0..1
  summaryFa: string;
  details?: Record<string, unknown>;
}

export interface SessionInfo {
  key: "asia" | "london" | "newyork" | "off";
  labelFa: string;
  liquidity: number; // 0..1
  utcHour: number;
}

export function sessionInfo(now = new Date()): SessionInfo {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (h >= 13 && h < 16.5)
    return { key: "newyork", labelFa: "سشن هم‌پوشانی لندن–نیویورک", liquidity: 1, utcHour: h };
  if (h >= 7 && h < 13)
    return { key: "london", labelFa: "سشن لندن", liquidity: 0.85, utcHour: h };
  if (h >= 16.5 && h < 21)
    return { key: "newyork", labelFa: "سشن نیویورک", liquidity: 0.9, utcHour: h };
  if (h >= 0 && h < 7)
    return { key: "asia", labelFa: "سشن آسیا (توکیو/جاکارتا)", liquidity: 0.65, utcHour: h };
  return { key: "off", labelFa: "خارج از سشن‌های اصلی", liquidity: 0.35, utcHour: h };
}

/* ================================================================== */
/* ۱) تحلیل‌گر تکنیکال — Technical Analyst                              */
/* ================================================================== */
export function technicalAnalyst(
  s: Snapshot,
  indicatorWeights: Record<string, number>
): AgentOutput & { subSignals: Record<string, number> } {
  const sub: Record<string, number> = {};

  // RSI mean-revert centered at 50 with extremes amplified
  const r = last(s.rsi14) ?? 50;
  let rsiSig = clamp((50 - r) / 30, -1, 1);
  if (r > 50 && r < 65) rsiSig = (r - 50) / 40; // mild momentum bias
  if (r >= 65) rsiSig = -(r - 65) / 35; // overbought fade
  if (r <= 35) rsiSig = (35 - r) / 35;
  sub.rsi = clamp(rsiSig, -1, 1);

  // MACD histogram direction
  const h = last(s.macdHist) ?? 0;
  sub.macd = clamp(h / (s.atrValue * 0.15 + 1e-9), -1, 1);

  // EMA trend structure
  const e20 = last(s.ema20);
  const e50 = last(s.ema50);
  sub.emaTrend =
    e20 == null || e50 == null ? 0 : clamp(((e20 - e50) / s.price) / 0.002, -1, 1);

  // Bollinger position (fade at edges)
  const up = last(s.bbUpper);
  const lo = last(s.bbLower);
  if (up != null && lo != null && up > lo) {
    const pos = (s.price - lo) / (up - lo);
    sub.bollinger = clamp((0.5 - pos) * 2, -1, 1) * (pos > 0.9 || pos < 0.1 ? 1 : 0.4);
  } else sub.bollinger = 0;

  // Stochastic turning
  const k = last(s.stoch) ?? 50;
  const prevs = s.stoch.filter((v): v is number => v != null);
  const prevK = prevs[prevs.length - 4] ?? k;
  sub.stoch = clamp((k - prevK) / 40, -1, 1);

  // Volume-confirmed impulse
  const vols = s.candles.map((c) => c.volume);
  const lastVol = vols[vols.length - 1] ?? 0;
  const avgVol = vols.slice(-30).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(30, vols.length));
  const body = s.candles.length > 1 ? s.price - s.candles[s.candles.length - 2].close : 0;
  sub.volume = avgVol > 0 && lastVol > avgVol * 1.4 ? clamp(body / (s.atrValue || 1), -1, 1) * 0.6 : 0;

  // weighted ensemble of indicators (learning-adjusted weights)
  let num = 0;
  let den = 0;
  for (const [key, sig] of Object.entries(sub)) {
    const w = indicatorWeights[key] ?? 1;
    num += sig * w;
    den += w;
  }
  const signal = den > 0 ? clamp(num / den, -1, 1) : 0;
  const agreement =
    Object.values(sub).filter((v) => Math.sign(v) === Math.sign(signal) && Math.abs(v) > 0.1).length /
    Math.max(1, Object.keys(sub).length);
  const confidence = clamp(0.25 + Math.abs(signal) * 0.45 + agreement * 0.3, 0, 0.97);

  const dirFa = signal > 0.15 ? "صعودی" : signal < -0.15 ? "نزولی" : "خنثی";
  const summaryFa = `چشم‌انداز تکنیکال ${dirFa} — RSI ${r.toFixed(0)}، MACD ${h >= 0 ? "مثبت" : "منفی"}، رژیم: ${
    s.regime === "trend_up" ? "روند صعودی" : s.regime === "trend_down" ? "روند نزولی" : "رنج"
  } (قدرت ${(s.trend * 100).toFixed(0)}٪)`;

  return {
    agent: "technical",
    signal: +signal.toFixed(3),
    confidence: +confidence.toFixed(3),
    summaryFa,
    subSignals: sub,
    details: { subSignals: sub, rsi: r, macdHist: h, regime: s.regime, trend: s.trend },
  };
}

/* ================================================================== */
/* ۲) استراتژیست — runs every strategy, picks the fittest for regime   */
/* ================================================================== */
export interface StrategyAgentOutput extends AgentOutput {
  chosen: string;
  chosenNameFa: string;
  all: (StrategyResult & { key: string; nameFa: string; fitness: number })[];
}

export function strategyScout(
  s: Snapshot,
  metrics: Record<string, { weight: number; winRate: number; trades: number }>,
  regimePerf?: Record<string, Record<string, { w: number; l: number }>>
): StrategyAgentOutput {
  const all = STRATEGY_DEFS.map((def) => {
    const res = def.run(s);
    const m = metrics[def.key] ?? { weight: 1, winRate: 0.5, trades: 0 };
    const regimeBoost =
      def.bestRegime === "any" ? 1 : def.bestRegime === s.regime ? 1.35 : 0.65;
    const experience = Math.min(1, m.trades / 20);
    // learned regime-specific memory: how this strategy behaved in THIS regime
    const cell = regimePerf?.[def.key]?.[s.regime];
    let regimeMemory = 1;
    if (cell && cell.w + cell.l >= 3) {
      const regimeWinRate = cell.w / (cell.w + cell.l);
      regimeMemory = 0.6 + (regimeWinRate / 0.65) * 0.7; // 0.6 .. ~1.5
    }
    const fitness =
      res.confidence *
      Math.abs(res.signal) *
      regimeBoost *
      regimeMemory *
      m.weight *
      (0.6 + 0.4 * (experience * m.winRate + (1 - experience) * 0.5));
    return { ...res, key: def.key, nameFa: def.nameFa, fitness };
  });
  all.sort((a, b) => b.fitness - a.fitness);
  const best = all[0];
  const def = STRATEGY_DEFS.find((d) => d.key === best.key)!;
  const regimeFa =
    s.regime === "trend_up" ? "روند صعودی" : s.regime === "trend_down" ? "روند نزولی" : "رنج";
  return {
    agent: "strategy",
    signal: +best.signal.toFixed(3),
    confidence: +clamp(best.confidence, 0, 0.97).toFixed(3),
    summaryFa: `رژیم بازار «${regimeFa}» تشخیص داده شد — استراتژی «${best.nameFa}» فیتنس ${(best.fitness * 100).toFixed(0)}٪ دارد: ${best.reason}`,
    chosen: def.key,
    chosenNameFa: best.nameFa,
    all,
    details: {
      chosen: def.key,
      regime: s.regime,
      leaderboard: all.map((a) => ({ key: a.key, fitness: +a.fitness.toFixed(3), signal: +a.signal.toFixed(2) })),
    },
  };
}

/* ================================================================== */
/* ۳) دیده‌بان اخبار — News Watchtower                                  */
/* ================================================================== */
export function newsWatchtower(agg: {
  signal: number;
  confidence: number;
  highImpactCount: number;
  bullish: number;
  bearish: number;
}): AgentOutput {
  const dir = agg.signal > 0.12 ? "حمایت از طلا" : agg.signal < -0.12 ? "فشار بر طلا" : "خنثی";
  const summaryFa =
    agg.highImpactCount + agg.bullish + agg.bearish === 0
      ? "جریان خبری آرام است — سوییه معناداری شناسایی نشد"
      : `جریان خبری: ${dir} — ${agg.highImpactCount} خبر پراثر، ${agg.bullish} مطلوب / ${agg.bearish} نامطلوب برای طلا`;
  return {
    agent: "news",
    signal: +agg.signal.toFixed(3),
    confidence: +agg.confidence.toFixed(3),
    summaryFa,
    details: {
      highImpactCount: agg.highImpactCount,
      bullish: agg.bullish,
      bearish: agg.bearish,
    },
  };
}

/* ================================================================== */
/* ۴) مدیر پرتفوی — aggregates all voices into one decision            */
/* ================================================================== */
export interface PortfolioDecision {
  score: number; // -1..1
  direction: "long" | "short" | "flat";
  confidence: number;
  votes: Record<string, { signal: number; confidence: number }>;
  summaryFa: string;
}

export function portfolioManager(
  technical: AgentOutput,
  strategy: AgentOutput,
  news: AgentOutput,
  session: SessionInfo,
  agentWeights: Record<string, number>,
  threshold: number
): PortfolioDecision {
  // news confidence shrinks when there is literally nothing; session adjusts news weight
  const votes: Record<string, { signal: number; confidence: number }> = {
    technical: { signal: technical.signal, confidence: technical.confidence },
    strategy: { signal: strategy.signal, confidence: strategy.confidence },
    news: { signal: news.signal, confidence: news.confidence },
  };
  let num = 0;
  let den = 0;
  for (const [agent, v] of Object.entries(votes)) {
    let w = (agentWeights[agent] ?? 1) * (0.4 + 0.6 * v.confidence);
    if (agent === "news") w *= session.key === "newyork" ? 1.25 : session.liquidity; // news matters most in NY
    num += v.signal * w;
    den += w;
  }
  const score = den > 0 ? clamp(num / den, -1, 1) : 0;
  // session threshold adjustment: thin-liquidity hours demand stronger signal
  const adjustedThreshold = threshold + (session.key === "off" ? 0.18 : session.key === "asia" ? 0.06 : 0);
  const direction = score > adjustedThreshold ? "long" : score < -adjustedThreshold ? "short" : "flat";
  const agreeing = Object.values(votes).filter((v) => Math.sign(v.signal) === Math.sign(score)).length;
  const confidence = clamp(0.3 + Math.abs(score) * 0.5 + (agreeing / 3) * 0.2, 0, 0.97);
  const summaryFa =
    direction === "flat"
      ? `امتیاز تجمیعی ${score.toFixed(2)} — زیر آستانه ${adjustedThreshold.toFixed(2)}؛ صبر می‌کنیم`
      : `امتیاز تجمیعی ${score.toFixed(2)} از آستانه ${adjustedThreshold.toFixed(2)} عبور کرد — دستور ${
          direction === "long" ? "خرید (Long)" : "فروش (Short)"
        } با اطمینان ${(confidence * 100).toFixed(0)}٪`;
  return {
    score: +score.toFixed(3),
    direction,
    confidence: +confidence.toFixed(3),
    votes,
    summaryFa,
  };
}

/* ================================================================== */
/* ۵) مدیر ریسک و اهرم — Risk & Leverage Manager                        */
/* ================================================================== */
export interface RiskDecision {
  allowed: boolean;
  leverage: number;
  qtyOz: number;
  stopDistance: number;
  takeProfitDistance: number;
  riskDollars: number;
  reason: string;
  summaryFa: string;
  volState: "low" | "normal" | "high" | "extreme";
}

export function riskManager(params: {
  decision: PortfolioDecision;
  snapshot: Snapshot;
  balance: number;
  riskPct: number;
  maxLeverage: number;
  killSwitchOn: boolean;
  dayPnlPct: number;
  maxDailyLossPct: number;
  newsSignal?: number;
  cooldownUntil?: number;
}): RiskDecision {
  const { decision, snapshot: s, balance, riskPct, maxLeverage, killSwitchOn, dayPnlPct, maxDailyLossPct } = params;
  const volState: RiskDecision["volState"] =
    s.atrRank > 0.85 ? "extreme" : s.atrRank > 0.65 ? "high" : s.atrRank > 0.35 ? "normal" : "low";

  if (killSwitchOn || dayPnlPct <= -maxDailyLossPct) {
    return {
      allowed: false,
      leverage: 1,
      qtyOz: 0,
      stopDistance: s.atrValue * 1.5,
      takeProfitDistance: s.atrValue * 3,
      riskDollars: 0,
      reason: "kill_switch",
      summaryFa: `کلید اضطراری فعال است — ضرر روزانه ${dayPnlPct.toFixed(1)}٪ به سقف ${maxDailyLossPct}٪ رسید؛ ورود جدید ممنوع`,
      volState,
    };
  }

  // loss-streak cooldown — the desk takes a breath after repeated losses
  if (params.cooldownUntil && params.cooldownUntil > Date.now()) {
    const mins = Math.ceil((params.cooldownUntil - Date.now()) / 60000);
    return {
      allowed: false,
      leverage: 1,
      qtyOz: 0,
      stopDistance: s.atrValue * 1.5,
      takeProfitDistance: s.atrValue * 3,
      riskDollars: 0,
      reason: "cooldown",
      summaryFa: `کول‌داون فعال — پس از زنجیره باخت، ورود جدید تا ${mins} دقیقه دیگر مسدود است تا مدل تنفس کند`,
      volState,
    };
  }
  if (decision.direction === "flat") {
    return {
      allowed: false,
      leverage: 1,
      qtyOz: 0,
      stopDistance: s.atrValue * 1.5,
      takeProfitDistance: s.atrValue * 3,
      riskDollars: 0,
      reason: "no_signal",
      summaryFa: `بدون سیگنال معتبر — اهرم پیش‌فرض ۱x نگه‌داشته می‌شود`,
      volState,
    };
  }

  const volFactor = volState === "extreme" ? 0.25 : volState === "high" ? 0.5 : volState === "normal" ? 0.8 : 1;
  // news/price conflict dampener: when the news flow fights the trade direction
  const newsSig = params.newsSignal ?? 0;
  const conflict =
    Math.abs(newsSig) > 0.3 && Math.sign(newsSig) !== Math.sign(decision.score) ? true : false;
  const conflictFactor = conflict ? 0.5 : 1;

  let leverage = Math.round(1 + (maxLeverage - 1) * decision.confidence * volFactor * conflictFactor);
  leverage = Math.max(1, Math.min(maxLeverage, leverage));

  const stopDistance = Math.max(s.atrValue * 1.5, s.price * 0.0012);
  const takeProfitDistance = stopDistance * (1.7 + decision.confidence * 0.8);

  const riskDollars = balance * (riskPct / 100) * (0.5 + 0.5 * decision.confidence) * conflictFactor;
  let qtyOz = riskDollars / stopDistance;
  const maxNotional = balance * leverage;
  qtyOz = Math.min(qtyOz, maxNotional / s.price);
  qtyOz = Math.floor(qtyOz * 100) / 100;
  const allowed = qtyOz >= 1;

  const volFa =
    volState === "extreme" ? "بی‌نهایت پرنوسان" : volState === "high" ? "پرنوسان" : volState === "normal" ? "عادی" : "کم‌نوسان";
  const summaryFa = allowed
    ? `بازار ${volFa} (ATR ${s.atrValue.toFixed(2)}$) — اهرم ${leverage}x، حجم ${qtyOz.toFixed(2)} اونس، ریسک ${riskDollars.toFixed(0)}$ (${(riskDollars / balance * 100).toFixed(1)}٪ سرمایه)${conflict ? " | تداخل با جریان خبری تشخیص داده شد — حجم و اهرم نصف شد" : ""}`
    : `سرمایه برای این سطح ریسک کافی نیست — حجم محاسباتی ${qtyOz.toFixed(2)} اونس زیر حداقل است`;

  return {
    allowed,
    leverage,
    qtyOz,
    stopDistance: +stopDistance.toFixed(2),
    takeProfitDistance: +takeProfitDistance.toFixed(2),
    riskDollars: +riskDollars.toFixed(2),
    reason: allowed ? "approved" : "capital",
    summaryFa,
    volState,
  };
}
