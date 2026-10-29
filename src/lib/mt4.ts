import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mt4Accounts, mt4Commands, mt4Positions } from "@/db/schema";

/* ------------------------------------------------------------------ */
/* MT4 / Alpari bridge — server side                                   */
/*                                                                     */
/* Architecture: MetaTrader 4 has no REST API, so our desktop EA       */
/* (ArgusBridge.mq4) polls /api/mt4/pull for commands and pushes       */
/* account state + acks to /api/mt4/push.                              */
/* ------------------------------------------------------------------ */

const OZ_PER_LOT_GOLD = 100; // standard Alpari XAUUSD contract size

export type Mt4Account = typeof mt4Accounts.$inferSelect;
export type Mt4Command = typeof mt4Commands.$inferSelect;
export type Mt4Position = typeof mt4Positions.$inferSelect;

export function generateBridgeToken(): string {
  return randomBytes(24).toString("hex");
}

export async function hashLogin(login: string): Promise<string> {
  return createHash("md5").update(login).digest("hex").slice(0, 12);
}

export async function listAccounts(): Promise<Mt4Account[]> {
  return db.select().from(mt4Accounts);
}

export async function createAccount(login: string, server: string | null): Promise<Mt4Account> {
  const token = generateBridgeToken();
  const rows = await db
    .insert(mt4Accounts)
    .values({ login, server, token, enabled: true, createdAt: Date.now() })
    .returning();
  return rows[0];
}

export async function findAccountByToken(token: string): Promise<Mt4Account | null> {
  const rows = await db.select().from(mt4Accounts).where(eq(mt4Accounts.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function setAccountEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(mt4Accounts).set({ enabled }).where(eq(mt4Accounts.id, id));
}

export async function deleteAccount(id: number): Promise<void> {
  await db.delete(mt4Commands).where(eq(mt4Commands.accountId, id));
  await db.delete(mt4Positions).where(eq(mt4Positions.accountId, id));
  await db.delete(mt4Accounts).where(eq(mt4Accounts.id, id));
}

/* ------------------------- command queue ---------------------------- */

/** Enqueue open commands on every enabled account. Returns how many. */
export async function enqueueOpenCommands(
  tradeId: number,
  side: "long" | "short",
  qtyOz: number,
  stopLoss: number | null,
  takeProfit: number | null,
  timeframe: string
): Promise<number> {
  const accounts = await db.select().from(mt4Accounts).where(eq(mt4Accounts.enabled, true));
  const lots = Math.floor((qtyOz / OZ_PER_LOT_GOLD) * 100) / 100;
  if (lots < 0.01) return 0;
  let n = 0;
  for (const acc of accounts) {
    await db.insert(mt4Commands).values({
      accountId: acc.id,
      type: "open",
      payload: {
        tradeId,
        side: side === "long" ? "buy" : "sell",
        lots,
        sl: stopLoss ? +stopLoss.toFixed(2) : 0,
        tp: takeProfit ? +takeProfit.toFixed(2) : 0,
        comment: `Argus #${tradeId} ${timeframe}`,
      },
      status: "pending",
      createdAt: Date.now(),
    });
    n++;
  }
  return n;
}

/** Enqueue close commands (only for accounts where mirroring is on). */
export async function enqueueCloseCommands(tradeId: number, ticket: number): Promise<number> {
  const accounts = await db.select().from(mt4Accounts).where(eq(mt4Accounts.enabled, true));
  let n = 0;
  for (const acc of accounts) {
    await db.insert(mt4Commands).values({
      accountId: acc.id,
      type: "close",
      payload: { tradeId, ticket },
      status: "pending",
      createdAt: Date.now(),
    });
    n++;
  }
  return n;
}

/** Pull pending commands for an account; mark them 'sent'. */
export async function pullCommands(accountId: number): Promise<Mt4Command[]> {
  const rows = await db
    .select()
    .from(mt4Commands)
    .where(and(eq(mt4Commands.accountId, accountId), eq(mt4Commands.status, "pending")))
    .orderBy(mt4Commands.id)
    .limit(10);
  for (const c of rows) {
    await db.update(mt4Commands).set({ status: "sent" }).where(eq(mt4Commands.id, c.id));
  }
  return rows;
}

export async function ackCommand(
  accountId: number,
  commandId: number,
  ok: boolean,
  result: Record<string, unknown>
): Promise<void> {
  await db
    .update(mt4Commands)
    .set({ status: ok ? "done" : "failed", result, doneAt: Date.now() })
    .where(and(eq(mt4Commands.id, commandId), eq(mt4Commands.accountId, accountId)));

  // link the MT4 ticket back to our paper trade so closes target it
  if (ok && typeof result.ticket === "number") {
    const cmd = await db.select().from(mt4Commands).where(eq(mt4Commands.id, commandId)).limit(1);
    const tradeId = cmd[0]?.payload?.tradeId;
    if (cmd[0]?.type === "open" && typeof tradeId === "number") {
      const { trades } = await import("@/db/schema");
      await db
        .update(trades)
        .set({ mt4Ticket: result.ticket })
        .where(eq(trades.id, tradeId));
    }
  }
}

/* ------------------------- account state push ------------------------ */

export interface Mt4PositionReport {
  ticket: number;
  type: "buy" | "sell";
  lots: number;
  openPrice: number;
  sl: number;
  tp: number;
  profit: number;
  openTime: number;
}

export async function pushAccountState(
  account: Mt4Account,
  state: { balance?: number; equity?: number; currency?: string },
  positions: Mt4PositionReport[]
): Promise<void> {
  await db
    .update(mt4Accounts)
    .set({
      lastSeen: Date.now(),
      balance: state.balance ?? account.balance,
      equity: state.equity ?? account.equity,
      currency: state.currency ?? account.currency,
    })
    .where(eq(mt4Accounts.id, account.id));

  // upsert reported positions, delete ones that vanished (closed in terminal)
  const seen = new Set<number>();
  for (const p of positions) {
    seen.add(p.ticket);
    await db
      .insert(mt4Positions)
      .values({ ...p, accountId: account.id, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: mt4Positions.ticket,
        set: { lots: p.lots, sl: p.sl, tp: p.tp, profit: p.profit, updatedAt: Date.now() },
      });
  }
  const existing = await db.select().from(mt4Positions).where(eq(mt4Positions.accountId, account.id));
  for (const row of existing) {
    if (!seen.has(row.ticket)) await db.delete(mt4Positions).where(eq(mt4Positions.ticket, row.ticket));
  }
}

export async function listPositions(accountId: number): Promise<Mt4Position[]> {
  return db.select().from(mt4Positions).where(eq(mt4Positions.accountId, accountId));
}

export async function listRecentCommands(accountId: number, limit = 10): Promise<Mt4Command[]> {
  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(mt4Commands)
    .where(eq(mt4Commands.accountId, accountId))
    .orderBy(desc(mt4Commands.id))
    .limit(limit);
}
