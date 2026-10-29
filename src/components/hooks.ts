"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types shared by the dashboard UI                                    */
/* ------------------------------------------------------------------ */
export interface SignalRow {
  id: number;
  agent: string;
  signal: number | null;
  confidence: number | null;
  summaryFa: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
}

export interface LogRow {
  id: number;
  agent: string;
  kind: string;
  messageFa: string;
  createdAt: number;
}

export interface NewsRow {
  id: number;
  category: string;
  source: string | null;
  title: string;
  url: string | null;
  publishedAt: number;
  sentiment: number | null;
  impact: string | null;
  keywords: string[] | null;
}

export interface TradeRow {
  id: number;
  side: string;
  status: string;
  entryPrice: number;
  exitPrice: number | null;
  qtyOz: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: number;
  closedAt: number | null;
  pnl: number | null;
  pnlPct: number | null;
  entryScore: number | null;
  exitReason: string | null;
  strategyKey: string | null;
  regime: string | null;
}

export interface StrategyRow {
  key: string;
  nameFa: string;
  nameEn: string;
  descFa: string | null;
  weight: number;
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  expectancy: number;
}

export interface DashboardState {
  ok: boolean;
  price: { last: number | null; change: number; ts: number | null };
  settings: {
    autoTrading: boolean;
    riskPct: number;
    maxLeverage: number;
    maxDailyLossPct: number;
    entryThreshold: number;
    killSwitchOn: boolean;
  };
  account: {
    balance: number;
    equity: number;
    startBalance: number;
    dayPnlPct: number;
    unrealized: number;
    totalPnl: number;
  };
  stats: { closedCount: number; winRate: number; profitFactor: number };
  openTrades: TradeRow[];
  closedTrades: TradeRow[];
  signals: Record<string, SignalRow>;
  logs: LogRow[];
  news: NewsRow[];
  strategies: StrategyRow[];
  learning: {
    agentWeights: Record<string, number>;
    indicatorWeights: Record<string, number>;
    xp: { xp: number; tradesLearned: number; wins: number; losses: number };
    level: number;
    levelProgress: number;
    calibration: { conf: number; correct: boolean }[];
    scoreHistory: number[];
    equityHistory: number[];
  };
  session: { key: string; labelFa: string; liquidity: number };
  mtf: {
    selected?: string;
    reasonFa?: string;
    h1Direction?: number;
    scores?: Record<string, number>;
    per?: Record<string, { signal: number; confidence: number; trend: number; regime: string; weight: number; bars: number }>;
    updatedAt?: number;
  };
  riskState: { lossStreak: number; cooldownUntil: number };
  mt4: Mt4AccountState[];
  serverTime: number;
}

export interface Mt4AccountState {
  id: number;
  login: string;
  server: string | null;
  token: string;
  enabled: boolean;
  balance: number | null;
  equity: number | null;
  currency: string | null;
  lastSeen: number | null;
  online: boolean;
  positions: {
    ticket: number;
    type: string;
    lots: number;
    openPrice: number;
    sl: number | null;
    tp: number | null;
    profit: number | null;
    openTime: number | null;
  }[];
  commands: {
    id: number;
    type: string;
    status: string;
    payload: Record<string, unknown>;
    createdAt: number;
  }[];
}

/* ------------------------------------------------------------------ */
/* Polling hook: state every 4s + engine tick every 12s                */
/* ------------------------------------------------------------------ */
export function useDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [connected, setConnected] = useState(false);
  const ticking = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const json = (await res.json()) as DashboardState;
      if (json.ok) {
        setState(json);
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      await fetch("/api/engine/tick", { method: "POST" });
      await refresh();
    } catch {
      /* next round will retry */
    } finally {
      ticking.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    void tick(); // immediate first tick warms the engine
    const t1 = setInterval(() => void refresh(), 4000);
    const t2 = setInterval(() => void tick(), 15000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [refresh, tick]);

  return { state, connected, refresh };
}

export async function control(body: Record<string, unknown>): Promise<void> {
  await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */
export const fmtUsd = (v: number, digits = 0): string =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export const fmtPct = (v: number, digits = 1): string => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s} ثانیه پیش`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ساعت پیش`;
  return `${Math.floor(h / 24)} روز پیش`;
}

export function clockFa(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
