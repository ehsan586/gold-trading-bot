import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { closeOpenTrades, getSettings, logAgent, resetFund, runTick } from "@/lib/engine";
import { clamp } from "@/lib/indicators";
import { createAccount, deleteAccount, setAccountEnabled, listAccounts } from "@/lib/mt4";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      riskPct?: number;
      maxLeverage?: number;
      entryThreshold?: number;
      maxDailyLossPct?: number;
      login?: string;
      server?: string;
      accountId?: number;
      enabled?: boolean;
    };
    const action = body.action;

    if (action === "toggle_engine") {
      const s = await getSettings();
      const next = !s.autoTrading;
      await db.update(settings).set({ autoTrading: next }).where(eq(settings.id, 1));
      await logAgent("portfolio", "decision", next ? "موتور معاملات خودکار روشن شد" : "موتور معاملات خودکار متوقف شد — فقط پایش فعال است");
      return NextResponse.json({ ok: true, autoTrading: next });
    }

    if (action === "set_params") {
      const patch: Record<string, number> = {};
      if (typeof body.riskPct === "number") patch.riskPct = clamp(body.riskPct, 0.25, 5);
      if (typeof body.maxLeverage === "number") patch.maxLeverage = Math.round(clamp(body.maxLeverage, 1, 100));
      if (typeof body.entryThreshold === "number") patch.entryThreshold = clamp(body.entryThreshold, 0.2, 0.9);
      if (typeof body.maxDailyLossPct === "number") patch.maxDailyLossPct = clamp(body.maxDailyLossPct, 1, 10);
      await db.update(settings).set(patch).where(eq(settings.id, 1));
      await logAgent(
        "risk",
        "risk",
        `پارامترهای ریسک به‌روزرسانی شد — ریسک هر معامله ${patch.riskPct?.toFixed(1) ?? "-"}٪، سقف اهرم ${patch.maxLeverage ?? "-"}x، آستانه ورود ${patch.entryThreshold?.toFixed(2) ?? "-"}`
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "close_all") {
      const n = await closeOpenTrades("manual");
      if (n > 0) await logAgent("portfolio", "trade", `${n} پوزیشن باز به دستور شما به صورت دستی بسته شد`);
      else await logAgent("portfolio", "decision", "دستور بستن پوزیشن دریافت شد اما پوزیشن بازی وجود ندارد");
      return NextResponse.json({ ok: true, closed: n });
    }

    if (action === "kill_switch_off") {
      await db.update(settings).set({ killSwitchOn: false }).where(eq(settings.id, 1));
      await logAgent("risk", "risk", "کلید اضطراری به صورت دستی بازنشانی شد — ورودها از سر گرفته می‌شود");
      return NextResponse.json({ ok: true });
    }

    if (action === "reset") {
      await resetFund();
      return NextResponse.json({ ok: true });
    }

    if (action === "tick") {
      const r = await runTick(true);
      return NextResponse.json(r);
    }

    /* ---------------- MT4 / Alpari bridge actions ---------------- */
    if (action === "mt4_link") {
      const login = (body.login ?? "").trim();
      if (!login) return NextResponse.json({ ok: false, error: "login required" }, { status: 400 });
      const acc = await createAccount(login, body.server?.trim() || null);
      await logAgent("portfolio", "decision", `حساب متاتریدر ۴ (${login}${body.server ? " @ " + body.server : ""}) لینک شد — منتظر اتصال اکسپرت ArgusBridge هستیم`);
      return NextResponse.json({ ok: true, account: { id: acc.id, login: acc.login, server: acc.server, token: acc.token } });
    }

    if (action === "mt4_toggle") {
      if (typeof body.accountId !== "number") return NextResponse.json({ ok: false }, { status: 400 });
      await setAccountEnabled(body.accountId, body.enabled ?? true);
      return NextResponse.json({ ok: true });
    }

    if (action === "mt4_unlink") {
      if (typeof body.accountId !== "number") return NextResponse.json({ ok: false }, { status: 400 });
      await deleteAccount(body.accountId);
      await logAgent("portfolio", "decision", "اتصال یک حساب متاتریدر قطع شد");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "control failed" },
      { status: 500 }
    );
  }
}
