"use client";

import { DashboardState, fmtPct, fmtUsd } from "./hooks";
import { Gauge, Flame, ShieldCheck, AlertTriangle } from "lucide-react";

export default function RiskPanel({ state }: { state: DashboardState | null }) {
  if (!state) return null;
  const { settings, account, openTrades, signals } = state;
  const leverage = openTrades[0]?.leverage ?? 0;
  const levPct = Math.min(100, (leverage / settings.maxLeverage) * 100);
  const dayPct = account.dayPnlPct;
  const lossUsed = Math.max(0, -dayPct / settings.maxDailyLossPct);
  const atrFromRisk = (signals.risk?.details?.volState as string) ?? null;
  const volFa =
    atrFromRisk === "extreme" ? "بحرانی" : atrFromRisk === "high" ? "بالا" : atrFromRisk === "low" ? "پایین" : atrFromRisk === "normal" ? "عادی" : "—";

  return (
    <div className="space-y-4">
      {/* leverage gauge */}
      <div>
        <div className="flex items-center justify-between text-[10.5px] text-white/45 mb-1.5">
          <span className="flex items-center gap-1.5"><Gauge size={11} className="text-rose-300" /> اهرم فعلی پوزیشن</span>
          <span className="num text-rose-200 font-bold">{leverage > 0 ? `${leverage}x` : "بدون پوزیشن"}</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-rose-500 to-amber-300 transition-all duration-700"
            style={{ width: `${levPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-white/25 mt-1 num">
          <span>1x</span>
          <span>سقف مجاز: {settings.maxLeverage}x</span>
        </div>
        <p className="text-[9.5px] text-white/30 mt-2 leading-4">
          مدیر ریسک اهرم را تابعی از «اطمینان تصمیم» و «نوسان بازار» می‌کند — در نوسان بحرانی اهرم به ربع کاهش می‌یابد.
        </p>
      </div>

      {/* volatility + session */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
          <div className="text-[9px] text-white/35 flex items-center justify-center gap-1"><Flame size={10} /> نوسان بازار</div>
          <div className="text-[13px] font-bold text-white/85 mt-1">{volFa}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
          <div className="text-[9px] text-white/35">سشن فعلی</div>
          <div className="text-[11px] font-bold text-white/85 mt-1 leading-4">{state.session.labelFa}</div>
        </div>
      </div>

      {/* daily loss kill switch */}
      <div>
        <div className="flex items-center justify-between text-[10.5px] text-white/45 mb-1.5">
          <span className="flex items-center gap-1.5">
            {settings.killSwitchOn ? (
              <AlertTriangle size={11} className="text-red-400" />
            ) : (
              <ShieldCheck size={11} className="text-emerald-300" />
            )}
            سپر ضرر روزانه
          </span>
          <span className={`num font-bold ${dayPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtPct(dayPct, 2)}</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${settings.killSwitchOn ? "bg-red-500" : "bg-gradient-to-l from-red-500/80 to-amber-400"}`}
            style={{ width: `${settings.killSwitchOn ? 100 : Math.min(100, lossUsed * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-white/25 mt-1 num">
          <span>۰٪</span>
          <span>کلید اضطراری: -{settings.maxDailyLossPct}٪</span>
        </div>
        {settings.killSwitchOn && (
          <p className="text-[10px] text-red-300 mt-2 leading-4">
            کلید اضطراری فعال است: ورود جدید تا فردا (۰۰:۰۰ UTC) مسدود شد. ریسک هر معامله {settings.riskPct}٪ سرمایه است.
          </p>
        )}
      </div>

      {/* snapshot of latest risk decision */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="text-[9px] text-white/35 mb-1">آخرین رأی مدیر ریسک</div>
        <p className="text-[10.5px] leading-5 text-white/65">{state.signals.risk?.summaryFa ?? "—"}</p>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="text-[9px] text-white/35 mb-1">وضعیت صندوق</div>
        <div className="flex justify-between text-[11px]">
          <span className="text-white/50">بالانس (تسویه‌شده)</span>
          <span className="num font-bold text-white/85">{fmtUsd(account.balance)}</span>
        </div>
        <div className="flex justify-between text-[11px] mt-1">
          <span className="text-white/50">اکوییتی (با سود شناور)</span>
          <span className={`num font-bold ${account.equity >= account.startBalance ? "text-emerald-300" : "text-red-300"}`}>
            {fmtUsd(account.equity)}
          </span>
        </div>
      </div>
    </div>
  );
}
