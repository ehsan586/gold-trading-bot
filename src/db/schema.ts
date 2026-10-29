import {
  pgTable,
  text,
  integer,
  bigint,
  doublePrecision,
  boolean,
  jsonb,
  serial,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Market data — 1 minute XAU/USD candles                              */
/* ------------------------------------------------------------------ */
export const candles = pgTable(
  "candles",
  {
    symbol: text("symbol").notNull(),
    tf: text("tf").notNull(),
    ts: bigint("ts", { mode: "number" }).notNull(), // epoch seconds
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").default(0),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.tf, t.ts] }),
    index("candles_symbol_tf_ts_idx").on(t.symbol, t.tf, t.ts),
  ]
);

/* ------------------------------------------------------------------ */
/* News items fetched from RSS with AI sentiment / impact scoring      */
/* ------------------------------------------------------------------ */
export const newsItems = pgTable(
  "news_items",
  {
    id: serial("id").primaryKey(),
    hash: text("hash").notNull().unique(),
    category: text("category").notNull(), // us | indonesia | world
    source: text("source"),
    title: text("title").notNull(),
    url: text("url"),
    publishedAt: bigint("published_at", { mode: "number" }).notNull(),
    sentiment: doublePrecision("sentiment").default(0), // -1..1 (gold direction)
    impact: text("impact").default("low"), // high | medium | low
    keywords: jsonb("keywords").$type<string[]>().default([]),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("news_published_idx").on(t.publishedAt)]
);

/* ------------------------------------------------------------------ */
/* Agent signals — every tick each agent publishes its view            */
/* ------------------------------------------------------------------ */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    agent: text("agent").notNull(), // technical | strategy | news | risk | portfolio | learning
    signal: doublePrecision("signal").default(0), // -1..1
    confidence: doublePrecision("confidence").default(0),
    summaryFa: text("summary_fa"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("signals_agent_created_idx").on(t.agent, t.createdAt)]
);

/* ------------------------------------------------------------------ */
/* Agent activity log — the "company war room" feed                    */
/* ------------------------------------------------------------------ */
export const agentLogs = pgTable(
  "agent_logs",
  {
    id: serial("id").primaryKey(),
    agent: text("agent").notNull(),
    kind: text("kind").notNull().default("info"), // info | decision | trade | learn | news | risk
    messageFa: text("message_fa").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("logs_created_idx").on(t.createdAt)]
);

/* ------------------------------------------------------------------ */
/* Trades — paper trades executed by the engine                        */
/* ------------------------------------------------------------------ */
export const trades = pgTable(
  "trades",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull().default("XAUUSD"),
    side: text("side").notNull(), // long | short
    status: text("status").notNull().default("open"), // open | closed
    entryPrice: doublePrecision("entry_price").notNull(),
    exitPrice: doublePrecision("exit_price"),
    qtyOz: doublePrecision("qty_oz").notNull(),
    leverage: integer("leverage").notNull().default(1),
    stopLoss: doublePrecision("stop_loss"),
    takeProfit: doublePrecision("take_profit"),
    highestSinceEntry: doublePrecision("highest_since_entry"),
    lowestSinceEntry: doublePrecision("lowest_since_entry"),
    spreadCost: doublePrecision("spread_cost").default(0),
    openedAt: bigint("opened_at", { mode: "number" }).notNull(),
    closedAt: bigint("closed_at", { mode: "number" }),
    pnl: doublePrecision("pnl"),
    pnlPct: doublePrecision("pnl_pct"),
    entryScore: doublePrecision("entry_score").default(0),
    exitReason: text("exit_reason"), // stop | trailing | target | signal_flip | timeout | manual | kill_switch
    strategyKey: text("strategy_key"),
    regime: text("regime"),
    timeframe: text("timeframe").default("m1"),
    mt4Ticket: integer("mt4_ticket"),
    realizedPnl: doublePrecision("realized_pnl").default(0),
    tp1Done: boolean("tp1_done").default(false),
    votes: jsonb("votes").$type<Record<string, { signal: number; confidence: number }>>(),
    subSignals: jsonb("sub_signals").$type<Record<string, number>>(),
  },
  (t) => [index("trades_status_idx").on(t.status)]
);

/* ------------------------------------------------------------------ */
/* Strategy registry + live performance metrics                        */
/* ------------------------------------------------------------------ */
export const strategies = pgTable("strategies", {
  key: text("key").primaryKey(),
  nameFa: text("name_fa").notNull(),
  nameEn: text("name_en").notNull(),
  descFa: text("desc_fa"),
  weight: doublePrecision("weight").notNull().default(1),
  trades: integer("trades").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  grossWin: doublePrecision("gross_win").notNull().default(0),
  grossLoss: doublePrecision("gross_loss").notNull().default(0),
  totalPnl: doublePrecision("total_pnl").notNull().default(0),
  expectancy: doublePrecision("expectancy").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Learning state — key/value store for the evolving brain             */
/* keys: agent_weights | indicator_weights | calibration | xp |        */
/*       score_history | equity_history | sim                          */
/* ------------------------------------------------------------------ */
export const learningState = pgTable("learning_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown> | unknown[] | number>().notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* MT4 / Alpari bridge                                                 */
/* ------------------------------------------------------------------ */
export const mt4Accounts = pgTable("mt4_accounts", {
  id: serial("id").primaryKey(),
  login: text("login").notNull(),
  server: text("server"),
  token: text("token").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  balance: doublePrecision("balance"),
  equity: doublePrecision("equity"),
  currency: text("currency").default("USD"),
  lastSeen: bigint("last_seen", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const mt4Commands = pgTable(
  "mt4_commands",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull(),
    type: text("type").notNull(), // open | close
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // pending | sent | done | failed
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    doneAt: bigint("done_at", { mode: "number" }),
  },
  (t) => [index("mt4cmd_status_idx").on(t.status)]
);

export const mt4Positions = pgTable("mt4_positions", {
  ticket: integer("ticket").primaryKey(),
  accountId: integer("account_id").notNull(),
  type: text("type").notNull(), // buy | sell
  lots: doublePrecision("lots").notNull(),
  openPrice: doublePrecision("open_price").notNull(),
  sl: doublePrecision("sl"),
  tp: doublePrecision("tp"),
  profit: doublePrecision("profit"),
  openTime: bigint("open_time", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Engine settings (singleton row id = 1)                              */
/* ------------------------------------------------------------------ */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  autoTrading: boolean("auto_trading").notNull().default(true),
  riskPct: doublePrecision("risk_pct").notNull().default(1),
  maxLeverage: integer("max_leverage").notNull().default(20),
  maxDailyLossPct: doublePrecision("max_daily_loss_pct").notNull().default(3),
  entryThreshold: doublePrecision("entry_threshold").notNull().default(0.45),
  balance: doublePrecision("balance").notNull().default(100000),
  startBalance: doublePrecision("start_balance").notNull().default(100000),
  dayStamp: text("day_stamp").notNull().default(""),
  dayStartEquity: doublePrecision("day_start_equity").notNull().default(100000),
  killSwitchOn: boolean("kill_switch_on").notNull().default(false),
  lastTick: bigint("last_tick", { mode: "number" }).notNull().default(0),
  lastNewsFetch: bigint("last_news_fetch", { mode: "number" }).notNull().default(0),
});
