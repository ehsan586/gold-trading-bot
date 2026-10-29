"use client";

import { DashboardState } from "./hooks";
import { Sparkline, WeightBar } from "./bits";
import { Zap, BrainCircuit, Target, LineChart } from "lucide-react";

export default function LearningPanel({ state }: { state: DashboardState | null }) {
  const l = state?.learning;
  if (!l) return null;

  const calib = l.calibration;
  // bucket calibration: average accuracy at low/mid/high confidence
  const buckets = [
    { label: "اطمینان کم", min: 0, max: 0.2, n: 0, ok: 0 },
    { label: "اطمینان متوسط", min: 0.2, max: 0.45, n: 0, ok: 0 },
    { label: "اطمینان بالا", min: 0.45, max: 1.01, n: 0, ok: 0 },
  ];
  for (const c of calib) {
    const b = buckets.find((b) => c.conf >= b.min && c.conf < b.max);
    if (b) {
      b.n++;
      if (c.correct) b.ok++;
    }
  }

  return (
    <div className="space-y-4">
      {/* level + xp */}
      <div className="flex items-center gap-4">
        <div className="relative size-14 rounded-2xl grid place-items-center bg-gradient-to-br from-purple-500/25 to-purple-400/5 border border-purple-400/25 shrink-0">
          <span className="text-lg font-extrabold text-purple-200 num">{l.level}</span>
          <span className="absolute -bottom-2 rounded-full bg-purple-500/80 text-[8.5px] font-bold px-1.5 py-px text-white">LVL</span>
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-[10.5px] text-white/45 mb-1">
            <span className="flex items-center gap-1"><Zap size={10} className="text-purple-300" /> سطح بلوغ مدل</span>
            <span className="num">{l.xp.xp} XP</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-purple-500 to-fuchsia-300 transition-all duration-1000"
              style={{ width: `${Math.min(100, l.levelProgress * 100)}%` }}
            />
          </div>
          <div className="text-[9.5px] text-white/30 mt-1">
            {l.xp.tradesLearned} تجربه معاملاتی — هر معامله انجام‌شده مغز سیستم را به‌روزرسانی می‌کند
          </div>
        </div>
      </div>

      {/* neural activity */}
      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-white/45 mb-1.5">
          <BrainCircuit size={11} className="text-amber-300" />
          فعالیت عصبی (امتیاز تصمیم در هر جلسه)
        </div>
        <Sparkline data={l.scoreHistory.length > 1 ? l.scoreHistory : [0, 0]} width={400} height={54} stroke="#f7b32b" baseline={0} />
      </div>

      {/* calibration */}
      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-white/45 mb-2">
          <Target size={11} className="text-emerald-300" />
          کالیبراسیون پیش‌بینی (اعتماد به نفس واقعی مدل)
        </div>
        <div className="grid grid-cols-3 gap-2">
          {buckets.map((b) => (
            <div key={b.label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2 text-center">
              <div className="text-[9px] text-white/35">{b.label}</div>
              <div className="text-[13px] font-bold num text-white/85 mt-0.5">
                {b.n > 0 ? `${((b.ok / b.n) * 100).toFixed(0)}٪` : "—"}
              </div>
              <div className="text-[8.5px] text-white/25">{b.n} نمونه</div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-white/25 mt-1.5 leading-4">
          اگر دقت در اطمینان بالا رو به رشد باشد، مدل دارد به جایی که «فکر می‌کند» خوب است نزدیک‌تر می‌شود.
        </p>
      </div>

      {/* indicator weights */}
      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-white/45 mb-2">
          <LineChart size={11} className="text-sky-300" />
          وزن یادگرفته‌شده اندیکاتورها
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {Object.entries(l.indicatorWeights).map(([k, v]) => {
            const fa: Record<string, string> = {
              rsi: "RSI",
              macd: "MACD",
              emaTrend: "روند EMA",
              bollinger: "بولینگر",
              stoch: "استوکستیک",
              volume: "حجم",
            };
            return (
              <div key={k}>
                <div className="flex justify-between text-[9.5px] text-white/40 mb-0.5">
                  <span>{fa[k] ?? k}</span>
                  <span className="num">×{v.toFixed(2)}</span>
                </div>
                <WeightBar value={v} max={3} color="#38bdf8" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
