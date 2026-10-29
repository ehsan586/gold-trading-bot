"use client";

import { motion } from "framer-motion";
import { StrategyRow, DashboardState, fmtUsd } from "./hooks";
import { Trophy, CircleCheck } from "lucide-react";

export default function StrategyBoard({
  strategies,
  state,
}: {
  strategies: StrategyRow[];
  state: DashboardState | null;
}) {
  const activeKey = (state?.signals?.strategy?.details?.chosen as string) ?? null;
  const sorted = [...strategies].sort((a, b) => b.weight - a.weight);

  return (
    <div className="space-y-1.5">
      {sorted.map((s, i) => {
        const winRate = s.trades > 0 ? s.wins / s.trades : null;
        const active = s.key === activeKey;
        return (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`relative rounded-xl border p-3 transition-colors ${
              active
                ? "border-amber-400/35 bg-amber-400/[0.07]"
                : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2">
              {i === 0 && <Trophy size={13} className="text-amber-300 shrink-0" />}
              <span className="text-[12px] font-bold text-white/90 truncate">{s.nameFa}</span>
              {active && (
                <span className="chip text-amber-200 border-amber-400/30 bg-amber-400/15 shrink-0">
                  <CircleCheck size={10} />
                  فعال
                </span>
              )}
              <span className="text-[10px] text-white/30 num ms-auto shrink-0 ltr">{s.nameEn}</span>
            </div>
            <p className="text-[10px] text-white/35 leading-4 mt-1 line-clamp-1">{s.descFa}</p>
            <div className="grid grid-cols-4 gap-2 mt-2.5 text-center">
              <div>
                <div className="text-[9px] text-white/30">معاملات</div>
                <div className="text-[11.5px] font-bold num text-white/80">{s.trades}</div>
              </div>
              <div>
                <div className="text-[9px] text-white/30">وین‌ریت</div>
                <div className="text-[11.5px] font-bold num text-white/80">
                  {winRate == null ? "—" : `${(winRate * 100).toFixed(0)}٪`}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-white/30">سود کل</div>
                <div className={`text-[11.5px] font-bold num ${s.totalPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {fmtUsd(s.totalPnl)}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-white/30">امتیاز (یادگیری)</div>
                <div className="text-[11.5px] font-bold num text-amber-200">×{s.weight.toFixed(2)}</div>
              </div>
            </div>
            <div className="h-[3px] rounded-full bg-white/[0.06] mt-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-l from-amber-500/60 to-amber-300 transition-all duration-700"
                style={{ width: `${Math.min(100, (s.weight / 2.2) * 100)}%` }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
