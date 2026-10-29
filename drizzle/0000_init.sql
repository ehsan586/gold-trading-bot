CREATE TABLE "agent_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"kind" text DEFAULT 'info' NOT NULL,
	"message_fa" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"symbol" text NOT NULL,
	"tf" text NOT NULL,
	"ts" bigint NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision DEFAULT 0,
	CONSTRAINT "candles_symbol_tf_ts_pk" PRIMARY KEY("symbol","tf","ts")
);
--> statement-breakpoint
CREATE TABLE "learning_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mt4_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"server" text,
	"token" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"balance" double precision,
	"equity" double precision,
	"currency" text DEFAULT 'USD',
	"last_seen" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "mt4_accounts_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mt4_commands" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" bigint NOT NULL,
	"done_at" bigint
);
--> statement-breakpoint
CREATE TABLE "mt4_positions" (
	"ticket" integer PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"type" text NOT NULL,
	"lots" double precision NOT NULL,
	"open_price" double precision NOT NULL,
	"sl" double precision,
	"tp" double precision,
	"profit" double precision,
	"open_time" bigint,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"category" text NOT NULL,
	"source" text,
	"title" text NOT NULL,
	"url" text,
	"published_at" bigint NOT NULL,
	"sentiment" double precision DEFAULT 0,
	"impact" text DEFAULT 'low',
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"created_at" bigint NOT NULL,
	CONSTRAINT "news_items_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_trading" boolean DEFAULT true NOT NULL,
	"risk_pct" double precision DEFAULT 1 NOT NULL,
	"max_leverage" integer DEFAULT 20 NOT NULL,
	"max_daily_loss_pct" double precision DEFAULT 3 NOT NULL,
	"entry_threshold" double precision DEFAULT 0.45 NOT NULL,
	"balance" double precision DEFAULT 100000 NOT NULL,
	"start_balance" double precision DEFAULT 100000 NOT NULL,
	"day_stamp" text DEFAULT '' NOT NULL,
	"day_start_equity" double precision DEFAULT 100000 NOT NULL,
	"kill_switch_on" boolean DEFAULT false NOT NULL,
	"last_tick" bigint DEFAULT 0 NOT NULL,
	"last_news_fetch" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"signal" double precision DEFAULT 0,
	"confidence" double precision DEFAULT 0,
	"summary_fa" text,
	"details" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"key" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"desc_fa" text,
	"weight" double precision DEFAULT 1 NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"gross_win" double precision DEFAULT 0 NOT NULL,
	"gross_loss" double precision DEFAULT 0 NOT NULL,
	"total_pnl" double precision DEFAULT 0 NOT NULL,
	"expectancy" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text DEFAULT 'XAUUSD' NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"entry_price" double precision NOT NULL,
	"exit_price" double precision,
	"qty_oz" double precision NOT NULL,
	"leverage" integer DEFAULT 1 NOT NULL,
	"stop_loss" double precision,
	"take_profit" double precision,
	"highest_since_entry" double precision,
	"lowest_since_entry" double precision,
	"spread_cost" double precision DEFAULT 0,
	"opened_at" bigint NOT NULL,
	"closed_at" bigint,
	"pnl" double precision,
	"pnl_pct" double precision,
	"entry_score" double precision DEFAULT 0,
	"exit_reason" text,
	"strategy_key" text,
	"regime" text,
	"timeframe" text DEFAULT 'm1',
	"mt4_ticket" integer,
	"realized_pnl" double precision DEFAULT 0,
	"tp1_done" boolean DEFAULT false,
	"votes" jsonb,
	"sub_signals" jsonb
);
--> statement-breakpoint
CREATE INDEX "logs_created_idx" ON "agent_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "candles_symbol_tf_ts_idx" ON "candles" USING btree ("symbol","tf","ts");--> statement-breakpoint
CREATE INDEX "mt4cmd_status_idx" ON "mt4_commands" USING btree ("status");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "signals_agent_created_idx" ON "signals" USING btree ("agent","created_at");--> statement-breakpoint
CREATE INDEX "trades_status_idx" ON "trades" USING btree ("status");