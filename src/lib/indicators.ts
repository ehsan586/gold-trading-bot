/* ------------------------------------------------------------------ */
/* Technical indicators — pure functions over number arrays            */
/* ------------------------------------------------------------------ */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = i >= period - 1 ? prev : null;
  }
  return out;
}

/** Wilder RSI */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalP = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? (fastE[i] as number) - (slowE[i] as number) : null
  );
  // signal = ema of macd over its defined region
  const defined = macdLine.map((v) => v ?? 0);
  const sig = ema(defined, signalP);
  const signalLine: (number | null)[] = macdLine.map((v, i) => (v == null ? null : sig[i]));
  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v == null || signalLine[i] == null ? null : v - (signalLine[i] as number)
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += Math.pow(values[j] - m, 2);
    const sd = Math.sqrt(variance / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i + 1] = prev;
  }
  return out;
}

export function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    out[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  return out;
}

export function donchian(
  highs: number[],
  lows: number[],
  period = 20
): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = new Array(highs.length).fill(null);
  const lower: (number | null)[] = new Array(highs.length).fill(null);
  for (let i = period - 1; i < highs.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    upper[i] = hh;
    lower[i] = ll;
  }
  return { upper, lower };
}

/** Simplified ADX-like trend strength in 0..1 based on EMA separation consistency */
export function trendStrength(closes: number[], lookback = 30): number {
  if (closes.length < lookback + 2) return 0;
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  let dir = 0;
  let agree = 0;
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const f = fast[i];
    const s = slow[i];
    if (f == null || s == null) continue;
    const d = f > s ? 1 : -1;
    if (dir === 0) dir = d;
    if (d === dir) agree++;
  }
  const consistency = agree / lookback;
  const last = closes.length - 1;
  const sep =
    fast[last] != null && slow[last] != null && closes[last] !== 0
      ? Math.abs((fast[last] as number) - (slow[last] as number)) / closes[last]
      : 0;
  const sepScore = Math.min(1, sep / 0.004);
  return +(0.5 * consistency + 0.5 * sepScore).toFixed(3);
}

/** Percentile rank of `value` inside `arr` (0..1) */
export function percentileRank(arr: number[], value: number): number {
  if (arr.length === 0) return 0.5;
  let below = 0;
  for (const v of arr) if (v < value) below++;
  return below / arr.length;
}

export function last<T>(arr: (T | null)[]): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
