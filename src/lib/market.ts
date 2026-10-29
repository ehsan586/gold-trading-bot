import { desc } from "drizzle-orm";
import { db } from "@/db";
import { candles as candlesTable } from "@/db/schema";

export interface Candle {
  ts: number; // epoch seconds, aligned to minute boundary
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStatus {
  source: "yahoo" | "synthetic";
  lastPrice: number;
  lastTs: number;
}

export const SYMBOL = "XAUUSD";
export const TF = "1m";
export const SPREAD = 0.35; // $ per oz typical gold spread

/* ---------------- in-memory caches (per server instance) ----------- */
let candleCache: { at: number; data: Candle[] } | null = null;

const minuteFloor = (sec: number): number => Math.floor(sec / 60) * 60;

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------------- Yahoo Finance 1m candles for GC=F (gold futures) - */
async function fetchYahooCandles(): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/GC=F` +
    `?period1=${now - 60 * 60 * 26}&period2=${now}&interval=1m&includePrePost=false`;
  const json = (await fetchJson(url)) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error("empty yahoo payload");
  const q = result.indicators?.quote?.[0];
  if (!q) throw new Error("no quote data");
  const out: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    const ts = minuteFloor(result.timestamp[i]);
    out.push({ ts, open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
  }
  // dedupe on minute boundary (yahoo can repeat the forming bar)
  const map = new Map<number, Candle>();
  for (const c of out) map.set(c.ts, c);
  const deduped = [...map.values()].sort((a, b) => a.ts - b.ts);
  if (deduped.length < 30) throw new Error("insufficient candles");
  return deduped;
}

/* ---------------- Real spot quote fallbacks (for anchoring) -------- */
async function fetchSpotQuote(): Promise<number | null> {
  try {
    const j = (await fetchJson("https://api.gold-api.com/price/XAU", 5000)) as { price?: number };
    if (j?.price && j.price > 500) return j.price;
  } catch { /* next */ }
  try {
    const res = await fetch("https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv", {
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    const lines = text.trim().split("\n");
    const close = Number(lines[lines.length - 1]?.split(",")[4]);
    if (close > 500) return close;
  } catch { /* give up */ }
  return null;
}

/* ---------------- Synthetic walk (offline-safe fallback) ------------ */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Mean-reverting regime-switching walk, anchored so it can never escape
 * far from reality. Step sigma ~ $0.6, drift decays fast.
 */
function walkStep(price: number, anchor: number, drift: number, trend: number): {
  open: number; high: number; low: number; close: number; drift: number;
} {
  const newDrift = 0.9 * drift + 0.1 * trend;
  const vol = 0.55 + Math.abs(gaussian()) * 0.45;
  const reversion = (anchor - price) * 0.006;
  const open = price;
  const close = open + newDrift + reversion + gaussian() * 0.55 * vol;
  const high = Math.max(open, close) + Math.abs(gaussian()) * 0.35 * vol;
  const low = Math.min(open, close) - Math.abs(gaussian()) * 0.35 * vol;
  return {
    open: +open.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    close: +close.toFixed(2),
    drift: newDrift,
  };
}

function synthesizeSeries(count: number, endMinuteTs: number, anchor: number): Candle[] {
  const candles: Candle[] = [];
  let price = anchor;
  let drift = 0;
  let trend = gaussian() * 0.08;
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.015) trend = gaussian() * 0.12;
    const step = walkStep(price, anchor, drift, trend);
    drift = step.drift;
    price = step.close;
    candles.push({
      ts: endMinuteTs - (count - 1 - i) * 60,
      open: step.open,
      high: step.high,
      low: step.low,
      close: step.close,
      volume: Math.round(400 + Math.abs(gaussian()) * 600),
    });
  }
  return candles;
}

async function insertCandles(data: Candle[]): Promise<void> {
  if (data.length === 0) return;
  await db
    .insert(candlesTable)
    .values(
      data.map((c) => ({
        symbol: SYMBOL,
        tf: TF,
        ts: c.ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))
    )
    .onConflictDoNothing();
}

/**
 * Ensure the DB has fresh 1m candles.
 * Live Yahoo first; synthetic walk (anchored to a real quote) only if offline.
 */
export async function syncMarketData(): Promise<MarketStatus> {
  const now = Date.now();
  if (candleCache && now - candleCache.at < 12_000 && candleCache.data.length > 0) {
    const last = candleCache.data[candleCache.data.length - 1];
    return { source: "yahoo", lastPrice: last.close, lastTs: last.ts };
  }

  try {
    const data = await fetchYahooCandles();
    candleCache = { at: now, data };
    await insertCandles(data);
    const last = data[data.length - 1];
    return { source: "yahoo", lastPrice: last.close, lastTs: last.ts };
  } catch {
    /* offline → synthetic */
  }

  // synthetic: one new candle per wall-clock minute, anchored to last stored price
  const recent = await getDbCandles(2);
  const lastStored = recent[recent.length - 1];
  const anchor = lastStored?.close ?? (await fetchSpotQuote()) ?? 3350;
  const nowMin = minuteFloor(Math.floor(now / 1000));
  if (lastStored && lastStored.ts >= nowMin) {
    return { source: "synthetic", lastPrice: lastStored.close, lastTs: lastStored.ts };
  }
  const step = walkStep(anchor, anchor, 0, 0);
  await insertCandles([
    {
      ts: nowMin,
      open: step.open,
      high: step.high,
      low: step.low,
      close: step.close,
      volume: Math.round(500 + Math.abs(gaussian()) * 500),
    },
  ]);
  return { source: "synthetic", lastPrice: step.close, lastTs: nowMin };
}

/** Seed history ONLY when nothing exists and live data is unreachable. */
export async function seedSyntheticHistoryIfEmpty(): Promise<boolean> {
  const rows = await getDbCandles(3);
  if (rows.length > 0) return false;
  const anchor = (await fetchSpotQuote()) ?? 3350;
  const endMin = minuteFloor(Math.floor(Date.now() / 1000)) - 60;
  const data = synthesizeSeries(360, endMin, anchor);
  await insertCandles(data);
  return true;
}

/** Latest N candles ascending. */
export async function getDbCandles(limit = 400): Promise<Candle[]> {
  const rows = await db
    .select()
    .from(candlesTable)
    .orderBy(desc(candlesTable.ts))
    .limit(limit);
  return rows
    .map((r) => ({
      ts: r.ts,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume ?? 0,
    }))
    .reverse();
}

/** Prune candles older than the newest minus keepCount rows. */
export async function pruneCandles(keep = 1400): Promise<void> {
  const cutoffRows = await db
    .select({ ts: candlesTable.ts })
    .from(candlesTable)
    .orderBy(desc(candlesTable.ts))
    .offset(keep)
    .limit(1);
  if (cutoffRows.length === 0) return;
  const { lt } = await import("drizzle-orm");
  await db.delete(candlesTable).where(lt(candlesTable.ts, cutoffRows[0].ts));
}
