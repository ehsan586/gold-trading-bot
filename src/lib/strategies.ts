import { Candle } from "./market";
import {
  ema,
  rsi,
  macd,
  bollinger,
  atr,
  stochastic,
  donchian,
  trendStrength,
  last,
  clamp,
} from "./indicators";

/* ------------------------------------------------------------------ */
/* Snapshot — everything the agents need, computed once per tick       */
/* ------------------------------------------------------------------ */
export interface Snapshot {
  candles: Candle[];
  closes: number[];
  highs: number[];
  lows: number[];
  price: number;
  ema20: (number | null)[];
  ema50: (number | null)[];
  rsi14: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  bbMid: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  atr14: (number | null)[];
  stoch: (number | null)[];
  donU: (number | null)[];
  donL: (number | null)[];
  atrValue: number;
  atrRank: number; // percentile of current ATR vs history
  trend: number; // 0..1
  regime: "trend_up" | "trend_down" | "range";
}

export function buildSnapshot(candles: Candle[]): Snapshot {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const { macd: macdLine, signal: macdSignal, histogram: macdHist } = macd(closes);
  const { mid: bbMid, upper: bbUpper, lower: bbLower } = bollinger(closes);
  const atr14 = atr(highs, lows, closes);
  const stoch = stochastic(highs, lows, closes);
  const { upper: donU, lower: donL } = donchian(highs, lows, 20);
  const price = closes[closes.length - 1] ?? 0;
  const rawAtr = last(atr14) ?? 1;
  // sanity clamp: 1m gold ATR realistically lives between $0.3 and ~1% of price
  const atrValue = clamp(rawAtr, Math.max(0.3, price * 0.0001), price * 0.01 || 40);
  const atrHistory = atr14.filter((v): v is number => v != null).slice(-120);
  const sorted = [...atrHistory].sort((a, b) => a - b);
  let rank = 0.5;
  for (let i = 0; i < sorted.length; i++) {
    if (atrValue >= sorted[i]) rank = (i + 1) / sorted.length;
  }
  const trend = trendStrength(closes);
  const e20 = last(ema20);
  const e50 = last(ema50);
  const regime: Snapshot["regime"] =
    trend > 0.62 && e20 != null && e50 != null
      ? e20 > e50
        ? "trend_up"
        : "trend_down"
      : "range";
  return {
    candles,
    closes,
    highs,
    lows,
    price: closes[closes.length - 1] ?? 0,
    ema20,
    ema50,
    rsi14,
    macdLine,
    macdSignal,
    macdHist,
    bbMid,
    bbUpper,
    bbLower,
    atr14,
    stoch,
    donU,
    donL,
    atrValue,
    atrRank: rank,
    trend,
    regime,
  };
}

/* ------------------------------------------------------------------ */
/* World-class strategies                                              */
/* each returns { signal: -1..1, confidence: 0..1, reason: string }    */
/* ------------------------------------------------------------------ */
export interface StrategyResult {
  signal: number;
  confidence: number;
  reason: string;
}

export interface StrategyDef {
  key: string;
  nameFa: string;
  nameEn: string;
  descFa: string;
  bestRegime: Snapshot["regime"] | "any";
  run: (s: Snapshot) => StrategyResult;
}

export const STRATEGY_DEFS: StrategyDef[] = [
  {
    key: "trend_following",
    nameFa: "تعقیب روند (EMA + MACD)",
    nameEn: "Trend Following",
    descFa: "کراس EMA۲۰/۵۰ با تایید هیستوگرام MACD — کلاسیک‌ترین استراتژی جهان",
    bestRegime: "trend_up",
    run: (s) => {
      const e20 = last(s.ema20);
      const e50 = last(s.ema50);
      const h = last(s.macdHist);
      if (e20 == null || e50 == null || h == null) return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const dir = e20 > e50 ? 1 : -1;
      const confirm = Math.sign(h) === dir ? 1 : 0.35;
      const strength = clamp(Math.abs(e20 - e50) / (s.price * 0.0015), 0, 1);
      return {
        signal: dir * (0.35 + 0.65 * strength),
        confidence: 0.35 + 0.5 * strength * confirm + 0.15 * s.trend,
        reason: dir > 0 ? "EMA20 بالای EMA50 با تایید MACD" : "EMA20 زیر EMA50 با تایید MACD",
      };
    },
  },
  {
    key: "mean_reversion",
    nameFa: "بازگشت به میانگین (بولینگر + RSI)",
    nameEn: "Mean Reversion",
    descFa: "خرید در اشباع فروش نزدیک باند پایین بولینگر و فروش در اشباع خرید",
    bestRegime: "range",
    run: (s) => {
      const r = last(s.rsi14);
      const up = last(s.bbUpper);
      const lo = last(s.bbLower);
      const mid = last(s.bbMid);
      if (r == null || up == null || lo == null || mid == null)
        return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const bandWidth = up - lo || 1;
      const pos = (s.price - lo) / bandWidth; // 0 bottom, 1 top
      let signal = 0;
      if (r < 32 && pos < 0.15) signal = (32 - r) / 28 + 0.3;
      else if (r > 68 && pos > 0.85) signal = -((r - 68) / 28 + 0.3);
      else signal = (0.5 - pos) * 0.7; // mild pull toward mid
      return {
        signal: clamp(signal, -1, 1),
        confidence: clamp(0.25 + Math.abs(signal) * 0.6 + (1 - s.trend) * 0.15, 0, 0.95),
        reason:
          r < 35 ? "RSI در اشباع فروش نزدیک باند پایین" : r > 65 ? "RSI در اشباع خرید نزدیک باند بالا" : "قیمت به سمت میانگین کشیده می‌شود",
      };
    },
  },
  {
    key: "breakout",
    nameFa: "شکست مومنتوم (دانشیان + ATR)",
    nameEn: "Breakout Momentum",
    descFa: "ورود روی شکست کانال ۲۰ کندلی دانشیان با فیلتر نوسان ATR",
    bestRegime: "any",
    run: (s) => {
      const up = last(s.donU);
      const lo = last(s.donL);
      if (up == null || lo == null) return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const prevHigh = s.highs[s.highs.length - 2] ?? 0;
      const prevLow = s.lows[s.lows.length - 2] ?? Infinity;
      // breakout happens against previous bar's channel
      if (s.price > prevHigh && s.price >= up - s.atrValue * 0.1) {
        return {
          signal: 0.85,
          confidence: clamp(0.4 + s.atrRank * 0.35 + s.trend * 0.2, 0, 0.95),
          reason: "شکست صعودی سقف کانال دانشیان",
        };
      }
      if (s.price < prevLow && s.price <= lo + s.atrValue * 0.1) {
        return {
          signal: -0.85,
          confidence: clamp(0.4 + s.atrRank * 0.35 + s.trend * 0.2, 0, 0.95),
          reason: "شکست نزولی کف کانال دانشیان",
        };
      }
      const distToUp = (up - s.price) / (s.atrValue || 1);
      const distToLo = (s.price - lo) / (s.atrValue || 1);
      if (distToUp < 0.5) return { signal: 0.35, confidence: 0.4, reason: "نزدیک به سقف کانال — آماده شکست" };
      if (distToLo < 0.5) return { signal: -0.35, confidence: 0.4, reason: "نزدیک به کف کانال — آماده شکست" };
      return { signal: 0, confidence: 0.2, reason: "در میانه کانال" };
    },
  },
  {
    key: "momentum_scalp",
    nameFa: "اسکلپ مومنتوم (استوکستیک + ایمپالس)",
    nameEn: "Momentum Scalping",
    descFa: "اسکلپ‌های سریع بر اساس چرخش استوکستیک و شتاب کندل‌های اخیر",
    bestRegime: "any",
    run: (s) => {
      const k = last(s.stoch);
      const c = s.closes;
      if (k == null || c.length < 6) return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const impulse = (c[c.length - 1] - c[c.length - 6]) / (s.atrValue * 2.2);
      const prevK = s.stoch[s.stoch.length - 4] ?? k;
      const turning = k - prevK;
      let signal = clamp(impulse, -1, 1) * 0.7 + clamp(turning / 50, -1, 1) * 0.3;
      // fade extreme overbought/oversold turns
      if (k > 82 && turning < 0) signal = -Math.abs(turning) / 40 - 0.15;
      if (k < 18 && turning > 0) signal = Math.abs(turning) / 40 + 0.15;
      return {
        signal: clamp(signal, -1, 1),
        confidence: clamp(0.3 + Math.abs(signal) * 0.55, 0, 0.9),
        reason:
          Math.abs(impulse) > 0.5
            ? impulse > 0 ? "شتاب صعودی قوی در ۵ کندل اخیر" : "شتاب نزولی قوی در ۵ کندل اخیر"
            : "مومنتوم خنثی",
      };
    },
  },
  {
    key: "news_momentum",
    nameFa: "مومنتوم خبری (Sentiment + قیمت)",
    nameEn: "News Momentum",
    descFa: "هم‌راستایی جهش قیمت با شوک خبری — معامله در جهت ناامیدی/خوش‌بینی",
    bestRegime: "any",
    run: (s) => {
      const c = s.closes;
      if (c.length < 12) return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const jump = (c[c.length - 1] - c[c.length - 12]) / (s.atrValue * 3);
      const volSpike = s.atrRank > 0.7;
      const signal = clamp(jump, -1, 1);
      if (Math.abs(signal) < 0.25) return { signal: 0, confidence: 0.15, reason: "فعلاً شوک قیمتی نداریم" };
      return {
        signal,
        confidence: clamp(0.3 + Math.abs(signal) * 0.4 + (volSpike ? 0.2 : 0), 0, 0.9),
        reason: signal > 0 ? "جهش قیمت هم‌جهت با جریان خبری" : "ریزش قیمت هم‌جهت با جریان خبری",
      };
    },
  },
  {
    key: "golden_zone",
    nameFa: "ناحیه طلایی (فیبوناچی + RSI Divergence)",
    nameEn: "Golden Zone Pullback",
    descFa: "پول‌بک به ناحیه ۰.۵ تا ۰.۶۱.۸ فیبوناچی در جهت روند غالب",
    bestRegime: "trend_up",
    run: (s) => {
      const c = s.closes;
      const window = 60;
      if (c.length < window) return { signal: 0, confidence: 0, reason: "داده ناکافی" };
      const slice = c.slice(-window);
      const hi = Math.max(...slice);
      const lo = Math.min(...slice);
      const range = hi - lo || 1;
      const trendDir = last(s.ema20)! > last(s.ema50)! ? 1 : -1;
      const retracement = trendDir > 0 ? (hi - s.price) / range : (s.price - lo) / range;
      const inZone = retracement >= 0.38 && retracement <= 0.66;
      const r = last(s.rsi14) ?? 50;
      const okMomentum = trendDir > 0 ? r < 45 && r > 25 : r > 55 && r < 75;
      if (inZone && okMomentum) {
        return {
          signal: trendDir * 0.8,
          confidence: clamp(0.45 + s.trend * 0.4, 0, 0.92),
          reason: trendDir > 0 ? "پول‌بک به ناحیه طلایی در روند صعودی" : "پول‌بک به ناحیه طلایی در روند نزولی",
        };
      }
      return { signal: 0, confidence: 0.2, reason: "قیمت خارج از ناحیه طلایی" };
    },
  },
];
