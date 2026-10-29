"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardState, fmtUsd } from "./hooks";
import { TrendingDown, TrendingUp, Radar } from "lucide-react";

export default function Header({ state, connected }: { state: DashboardState | null; connected: boolean }) {
  const price = state?.price.last ?? null;
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (price != null && prev.current != null && price !== prev.current) {
      setFlash(price > prev.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 700);
      return () => clearTimeout(t);
    }
    prev.current = price;
  }, [price]);

  const change = state?.price.change ?? 0;
  const equity = state?.account.equity ?? null;
  const start = state?.account.startBalance ?? 100000;
  const totalReturn = equity != null ? ((equity - start) / start) * 100 : 0;

  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 py-3 backdrop-blur-xl bg-[#07090f]/80 border-b border-white/[0.06]">
      <div className="mx-auto max-w-[1600px] flex flex-wrap items-center gap-x-5 gap-y-2">
        {/* brand */}
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center size-9 rounded-xl bg-gradient-to-br from-amber-300/25 to-amber-600/10 border border-amber-300/30">
            <Radar size={17} className="text-amber-300" />
          </span>
          <div>
            <h1 className="text-[15px] font-extrabold gold-text leading-5">آرگوس</h1>
            <p className="text-[9.5px] text-white/40 leading-4">صندوق ترید خودگردان طلا · شش عامل هوشمند</p>
          </div>
        </div>

        {/* live price */}
        <div className={`flex items-center gap-2.5 rounded-xl px-3.5 py-1.5 border border-white/[0.07] ${flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""}`}>
          <span className="relative flex size-2">
            <span className={`pulse-dot absolute inline-flex size-full rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="relative inline-flex size-2 rounded-full" style={{ background: connected ? "#34d399" : "#f87171" }} />
          </span>
          <span className="text-[10px] text-white/40">XAU/USD</span>
          <span className="ticker-glow text-[19px] font-extrabold num text-amber-200">
            {price != null ? price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
          </span>
          <span className={`flex items-center gap-0.5 text-[11px] num font-bold ${change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}
          </span>
        </div>

        {/* equity */}
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[9px] text-white/35">ارزش کل صندوق</div>
            <div className="text-[14px] font-extrabold num text-white/90">{equity != null ? fmtUsd(equity) : "—"}</div>
          </div>
          <div>
            <div className="text-[9px] text-white/35">بازده کل</div>
            <div className={`text-[14px] font-extrabold num ${totalReturn >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {totalReturn >= 0 ? "+" : ""}
              {totalReturn.toFixed(2)}٪
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-[9px] text-white/35">وین‌ریت / پرافیت‌فکتور</div>
            <div className="text-[12px] font-bold num text-white/80">
              {((state?.stats.winRate ?? 0) * 100).toFixed(0)}٪ · {(state?.stats.profitFactor ?? 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <span className={`chip ${state?.settings.autoTrading ? "text-emerald-300 border-emerald-400/25 bg-emerald-400/10" : "text-white/40"}`}>
            {state?.settings.autoTrading ? "موتور خودکار: روشن" : "موتور خودکار: خاموش"}
          </span>
          {state?.mtf?.selected && (
            <span className="chip text-purple-300 border-purple-400/25 bg-purple-400/10 num">
              مغز روی {(state.mtf.selected).toUpperCase()}
            </span>
          )}
          {state?.mt4?.some((a) => a.online) && (
            <span className="chip text-emerald-300 border-emerald-400/25 bg-emerald-400/10">MT4 متصل</span>
          )}
          <span className="chip text-white/40 num hidden sm:inline-flex">{state?.session.labelFa}</span>
        </div>
      </div>
    </header>
  );
}
