import { Candle } from "./market";
import { Snapshot, buildSnapshot } from "./strategies";
import { technicalAnalyst } from "./agents";
import { clamp } from "./indicators";

/* ------------------------------------------------------------------ */
/* Multi-timeframe engine                                              */
/* ------------------------------------------------------------------ */
export type TfKey = "m1" | "m5" | "m15" | "h1";

export const TF_MINUTES: Record<TfKey, number> = { m1: 1, m5: 5, m15: 15, h1: 60 };
export const TF_LABEL_FA: Record<TfKey, string> = {
  m1: "۱ دقیقه‌ای",
  m5: "۵ دقیقه‌ای",
  m15: "۱۵ دقیقه‌ای",
  h1: "۱ ساعته",
};

/** Aggregate 1m candles into bigger timeframe bars. */
export function aggregateCandles(candles1m: Candle[], minutes: number): Candle[] {
  if (minutes === 1) return candles1m;
  const bucket = minutes * 60;
  const map = new Map<number, Candle>();
  for (const c of candles1m) {
    const k = Math.floor(c.ts / bucket) * bucket;
    const ex = map.get(k);
    if (!ex) {
      map.set(k, { ts: k, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      ex.high = Math.max(ex.high, c.high);
      ex.low = Math.min(ex.low, c.low);
      ex.close = c.close;
      ex.volume += c.volume;
    }
  }
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

export interface TfView {
  key: TfKey;
  candles: Candle[];
  snapshot: Snapshot;
  signal: number; // technical ensemble on this TF
  confidence: number;
  bars: number; // reliability proxy
}

/**
 * Build the full timeframe stack. H1 needs the most history; our DB keeps
 * ~23h of 1m bars (~23 H1 bars) — we still build it, reliability is handled
 * by the `bars` count in the selector.
 */
export function buildTfStack(candles1m: Candle[], indicatorWeights: Record<string, number>): TfView[] {
  const keys: TfKey[] = ["m1", "m5", "m15", "h1"];
  const out: TfView[] = [];
  for (const key of keys) {
    const candles = aggregateCandles(candles1m, TF_MINUTES[key]);
    if (candles.length < 40) {
      out.push({
        key,
        candles,
        snapshot: buildSnapshot(candles1m), // fallback so UI never breaks
        signal: 0,
        confidence: 0,
        bars: candles.length,
      });
      continue;
    }
    const snapshot = buildSnapshot(candles);
    const tech = technicalAnalyst(snapshot, indicatorWeights);
    out.push({
      key,
      candles,
      snapshot,
      signal: tech.signal,
      confidence: tech.confidence,
      bars: candles.length,
    });
  }
  return out;
}

export interface TfSelection {
  selected: TfKey;
  reasonFa: string;
  h1Direction: number; // -1 / 0 / +1 — the macro compass
  scores: Record<TfKey, number>;
}

/**
 * Intelligent timeframe switcher.
 * Logic: compute per-TF "clarity" = |signal| × confidence × trendCalibration
 * × learned tfWeight. The higher timeframe acts as a macro compass: when H1
 * has a clear trend, we trade pullbacks on m5/m15 in its direction; when the
 * market is choppy on higher TFs, we scalp on m1.
 */
export function selectTimeframe(stack: TfView[], tfWeights: Record<string, number>): TfSelection {
  const scores = {} as Record<TfKey, number>;
  const h1 = stack.find((t) => t.key === "h1")!;
  const h1Dir = h1.bars >= 40 && Math.abs(h1.signal) > 0.18 ? Math.sign(h1.signal) : 0;

  for (const t of stack) {
    const reliability = clamp(t.bars / 80, 0.3, 1);
    const clarity = Math.abs(t.signal) * t.confidence * (0.5 + t.snapshot.trend * 0.5);
    const w = tfWeights[t.key] ?? 1;
    let bonus = 1;
    if (h1Dir !== 0) {
      // higher TF alignment bonus — trade with the macro tide on mid TFs
      const aligned = Math.sign(t.signal) === h1Dir;
      if (t.key === "m5" || t.key === "m15") bonus *= aligned ? 1.35 : 0.7;
      if (t.key === "m1") bonus *= t.snapshot.trend < 0.4 ? 1.1 : 0.85; // chop scavenging
    }
    scores[t.key] = clarity * reliability * w * bonus;
  }

  // pick argmax with a modest preference for m5 baseline when scores are close
  const entries = Object.entries(scores) as [TfKey, number][];
  entries.sort((a, b) => b[1] - a[1]);
  let selected = entries[0][0];
  if (scores.m5 > entries[0][1] * 0.85) selected = "m5";

  const selView = stack.find((t) => t.key === selected)!;
  const reasonFa = h1Dir
    ? `کامپاس کلان H1 ${h1Dir > 0 ? "صعودی" : "نزولی"} است — اجرای معامله روی ${TF_LABEL_FA[selected]} با شفافیت ${(Math.abs(selView.signal) * 100).toFixed(0)}٪`
    : `H1 جهت مشخصی ندارد — تایم‌فریم ${TF_LABEL_FA[selected]} بیشترین شفافیت (${(Math.abs(selView.signal) * 100).toFixed(0)}٪) را دارد`;

  return { selected, reasonFa, h1Direction: h1Dir, scores };
}

/* learning container */
export const DEFAULT_TF_WEIGHTS: Record<string, number> = { m1: 1, m5: 1.1, m15: 1, h1: 1 };
