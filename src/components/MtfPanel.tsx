"use client";

import { motion } from "framer-motion";
import { DashboardState } from "./hooks";
import { WeightBar } from "./bits";
import { ArrowDown, ArrowUp, Minus, Globe2 } from "lucide-react";

const TFS = ["m1", "m5", "m15", "h1"] as const;
const TF_FA: Record<string, string> = { m1: "M1 · اسکلپ", m5: "M5 · دقیق", m15: "M15 · نوسان‌گیر", h1: "H1 · کامپاس کلان" };

export default function MtfPanel({ state }: { state: DashboardState | null }) {
  const mtf = state?.mtf;
  if (!mtf?.per) {
    return <div className="text-center text-white/30 text-xs py-14">تحلیلگر چندتایم‌فریمه در حال آماده‌سازی ماتریس…</div>;
  }
  const compass = mtf.h1Direction ?? 0;

  return (
    <div className="space-y-3">
      {/* macro compass */}
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <Globe2 size={16} className={compass > 0 ? "text-emerald-300" : compass < 0 ? "text-red-300" : "text-white/30"} />
        <div className="flex-1">
          <div className="text-[11px] font-bold text-white/85">
            کامپاس کلان H1:{" "}
            <span className={compass > 0 ? "text-emerald-300" : compass < 0 ? "text-red-300" : "text-white/50"}>
              {compass > 0 ? "صعودی" : compass < 0 ? "نزولی" : "بدون جهت"}
            </span>
          </div>
          <p className="text-[10px] text-white/40 leading-4 mt-1">{mtf.reasonFa}</p>
        </div>
        <span className="chip text-amber-200 border-amber-400/25 bg-amber-400/10 shrink-0">
          فعال: {(mtf.selected ?? "").toUpperCase()}
        </span>
      </div>

      {/* matrix */}
      <div className="grid grid-cols-4 gap-2">
        {TFS.map((tf, i) => {
          const d = mtf.per?.[tf];
          if (!d) return null;
          const active = mtf.selected === tf;
          const Dir = d.signal > 0.12 ? ArrowUp : d.signal < -0.12 ? ArrowDown : Minus;
          const dirColor = d.signal > 0.12 ? "#34d399" : d.signal < -0.12 ? "#f87171" : "#8a93a6";
          return (
            <motion.div
              key={tf}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-xl border p-2.5 text-center transition-colors ${
                active ? "border-amber-400/40 bg-amber-400/[0.08]" : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="text-[10px] font-bold text-white/70">{TF_FA[tf]}</div>
              <div className="my-1.5 flex justify-center">
                <span className="grid place-items-center size-8 rounded-full" style={{ background: `${dirColor}14`, color: dirColor }}>
                  <Dir size={16} />
                </span>
              </div>
              <div className="text-[10px] num text-white/60">
                {(d.signal >= 0 ? "+" : "") + d.signal.toFixed(2)}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">
                روند {(d.trend * 100).toFixed(0)}٪ · {d.regime === "range" ? "رنج" : d.regime === "trend_up" ? "صعودی" : "نزولی"}
              </div>
              <div className="mt-1.5">
                <div className="flex justify-between text-[8.5px] text-white/25 mb-0.5">
                  <span>وزن یادگیری</span>
                  <span className="num">×{d.weight.toFixed(2)}</span>
                </div>
                <WeightBar value={d.weight} max={2.5} color={active ? "#f7b32b" : "#64748b"} />
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-[9.5px] text-white/25 leading-4">
        مغز سیستم بر اساس «شفافیت سیگنال × اطمینان × قدرت روند × وزن یادگرفته‌شده» بین تایم‌فریم‌ها سوییچ می‌کند و کامپاس H1 بر خلاف‌جهتِ آن ورود نمی‌کند مگر با قدرت بالای ۷۵٪.
      </p>
    </div>
  );
}
