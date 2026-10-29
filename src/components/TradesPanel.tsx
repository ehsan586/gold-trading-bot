"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardState, TradeRow, fmtUsd, control } from "./hooks";
import { Sparkline } from "./bits";
import { ArrowDownRight, ArrowUpRight, XCircle, ShieldAlert, Crosshair } from "lucide-react";

function unrealized(t: TradeRow, price: number | null): number {
  if (price == null) return 0;
  return (t.side === "long" ? price - t.entryPrice : t.entryPrice - price) * t.qtyOz;
}

export default function TradesPanel({
  state,
  onAction,
}: {
  state: DashboardState | null;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const price = state?.price.last ?? null;
  const open = state?.openTrades ?? [];
  const closed = state?.closedTrades ?? [];
  const eqHist = state?.learning.equityHistory ?? [];

  const closeAll = async () => {
    setBusy(true);
    try {
      await control({ action: "close_all" });
      await control({ action: "tick" });
      onAction();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* ------------ open position ------------ */}
      <div className="lg:col-span-2">
        <div className="text-[11px] text-white/40 mb-2 flex items-center gap-1.5">
          <Crosshair size={12} className="text-amber-300" />
          پوزیشن باز
        </div>
        {open.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-5 text-center">
            <p className="text-[12px] text-white/40">پوزیشن بازی وجود ندارد</p>
            <p className="text-[10px] text-white/25 mt-1.5 leading-4">
              مدیر پرتفوی منتظر هم‌گرایی قوی میان تحلیل تکنیکال، استراتژی و اخبار است
            </p>
          </div>
        ) : (
          open.map((t) => {
            const u = unrealized(t, price);
            const up = u >= 0;
            return (
              <motion.div
                key={t.id}
                layout
                className={`rounded-xl border p-4 ${
                  t.side === "long"
                    ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                    : "border-red-400/25 bg-red-400/[0.06]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.side === "long" ? (
                    <ArrowUpRight size={16} className="text-emerald-300" />
                  ) : (
                    <ArrowDownRight size={16} className="text-red-300" />
                  )}
                  <span className={`text-[13px] font-bold ${t.side === "long" ? "text-emerald-300" : "text-red-300"}`}>
                    {t.side === "long" ? "خرید طلا (Long)" : "فروش طلا (Short)"}
                  </span>
                  <span className="chip text-amber-200 border-amber-400/25 bg-amber-400/10 num">{t.leverage}x</span>
                  <motion.span
                    key={Math.round(u)}
                    className={`ms-auto text-[15px] font-extrabold num ${up ? "text-emerald-300" : "text-red-300"}`}
                  >
                    {fmtUsd(u)}
                  </motion.span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    ["ورود", t.entryPrice.toFixed(2)],
                    ["حجم (اونس)", t.qtyOz.toFixed(2)],
                    ["امتیاز ورود", ((t.entryScore ?? 0) * 100).toFixed(0) + "٪"],
                    ["حد ضرر", t.stopLoss?.toFixed(2) ?? "—"],
                    ["حد سود", t.takeProfit?.toFixed(2) ?? "—"],
                    ["قیمت لحظه‌ای", price?.toFixed(2) ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.04] py-1.5">
                      <div className="text-[9px] text-white/35">{k}</div>
                      <div className="text-[11.5px] font-bold num text-white/85">{v}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={closeAll}
                  disabled={busy}
                  className="mt-3 w-full rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-[11.5px] font-bold py-2 hover:bg-red-400/20 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <XCircle size={13} />
                  {busy ? "در حال بستن…" : "بستن دستی پوزیشن (قیمت بازار)"}
                </button>
              </motion.div>
            );
          })
        )}

        {/* equity curve */}
        <div className="mt-4">
          <div className="text-[11px] text-white/40 mb-2">منحنی رشد سرمایه</div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2">
            <Sparkline
              data={eqHist.length > 1 ? eqHist : [100000, 100000]}
              width={400}
              height={72}
              stroke={(state?.account.equity ?? 0) >= (state?.account.startBalance ?? 100000) ? "#34d399" : "#f87171"}
              baseline={state?.account.startBalance ?? 100000}
            />
          </div>
        </div>
      </div>

      {/* ------------ history ------------ */}
      <div className="lg:col-span-3">
        <div className="text-[11px] text-white/40 mb-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-white/30" />
          تاریخچه معاملات ({closed.length})
        </div>
        <div className="rounded-xl border border-white/[0.05] overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-white/[0.04] text-white/40">
                <th className="py-2 px-3 text-right font-medium">#</th>
                <th className="py-2 px-3 text-right font-medium">جهت</th>
                <th className="py-2 px-3 text-right font-medium">ورود</th>
                <th className="py-2 px-3 text-right font-medium">خروج</th>
                <th className="py-2 px-3 text-right font-medium">اهرم</th>
                <th className="py-2 px-3 text-right font-medium">استراتژی</th>
                <th className="py-2 px-3 text-right font-medium">علت خروج</th>
                <th className="py-2 px-3 text-left font-medium">سود/زیان</th>
              </tr>
            </thead>
            <tbody>
              {closed.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-white/25">
                    هنوز معامله‌ای بسته نشده — نخستین تجربه در راه است
                  </td>
                </tr>
              )}
              {closed.map((t) => (
                <tr key={t.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2 px-3 num text-white/40">{t.id}</td>
                  <td className="py-2 px-3">
                    <span className={t.side === "long" ? "text-emerald-300" : "text-red-300"}>
                      {t.side === "long" ? "خرید" : "فروش"}
                    </span>
                  </td>
                  <td className="py-2 px-3 num text-white/60">{t.entryPrice.toFixed(1)}</td>
                  <td className="py-2 px-3 num text-white/60">{t.exitPrice?.toFixed(1) ?? "—"}</td>
                  <td className="py-2 px-3 num text-amber-200/80">{t.leverage}x</td>
                  <td className="py-2 px-3 text-white/45 ltr text-right">{t.strategyKey ?? "—"}</td>
                  <td className="py-2 px-3 text-white/45">
                    {t.exitReason === "stop"
                      ? "حد ضرر"
                      : t.exitReason === "trailing"
                        ? "تریلینگ"
                        : t.exitReason === "target"
                          ? "حد سود"
                          : t.exitReason === "signal_flip"
                            ? "چرخش سیگنال"
                            : t.exitReason === "timeout"
                              ? "پایان زمان"
                              : t.exitReason === "manual"
                                ? "دستی"
                                : t.exitReason ?? "—"}
                  </td>
                  <td className={`py-2 px-3 num text-left font-bold ${(t.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {fmtUsd(t.pnl ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
