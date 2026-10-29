"use client";

import { motion } from "framer-motion";
import {
  Brain,
  CandlestickChart,
  Compass,
  GraduationCap,
  Scale,
  Satellite,
  LucideIcon,
} from "lucide-react";
import { DashboardState } from "./hooks";
import { WeightBar } from "./bits";

interface AgentMeta {
  key: string;
  nameFa: string;
  roleFa: string;
  icon: LucideIcon;
  accent: string;
}

const AGENTS: AgentMeta[] = [
  { key: "technical", nameFa: "تحلیل‌گر تکنیکال", roleFa: "رسم و ارزیابی اندیکاتورها روی نمودار طلا", icon: CandlestickChart, accent: "#f7b32b" },
  { key: "strategy", nameFa: "استراتژیست ارشد", roleFa: "کالبدشکافی استراتژی‌های برتر جهان و انتخاب بهترین", icon: Compass, accent: "#7c8cff" },
  { key: "news", nameFa: "دیده‌بان اخبار", roleFa: "پایش لحظه‌ای اخبار آمریکا، اندونزی و جهان", icon: Satellite, accent: "#38bdf8" },
  { key: "risk", nameFa: "مدیر ریسک و اهرم", roleFa: "تعیین اهرم، حجم و حد ضرر بر اساس نوسان", icon: Scale, accent: "#fb7185" },
  { key: "portfolio", nameFa: "مدیر پرتفوی", roleFa: "تصمیم نهایی ورود و خروج معاملات", icon: Brain, accent: "#34d399" },
  { key: "learning", nameFa: "موتور یادگیری", roleFa: "تکرارپذیر شدن تجربه — قوی‌تر شدن لحظه‌به‌لحظه", icon: GraduationCap, accent: "#c084fc" },
];

function SignalBadge({ signal }: { signal: number | null | undefined }) {
  if (signal == null) return <span className="chip text-white/35">—</span>;
  if (signal > 0.1) return <span className="chip text-emerald-300 border-emerald-400/20 bg-emerald-400/10">خرید {signal.toFixed(2)}</span>;
  if (signal < -0.1) return <span className="chip text-red-300 border-red-400/20 bg-red-400/10">فروش {signal.toFixed(2)}</span>;
  return <span className="chip text-white/50">خنثی {signal.toFixed(2)}</span>;
}

export default function WarRoom({ state }: { state: DashboardState | null }) {
  const weights = state?.learning.agentWeights ?? {};
  const xp = state?.learning.xp;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {AGENTS.map((a, i) => {
        const sig = state?.signals?.[a.key];
        const isLearning = a.key === "learning";
        const weight = weights[a.key];
        const conf = sig?.confidence ?? null;
        const summary = isLearning
          ? xp
            ? `${xp.tradesLearned} معامله آموخته شد (${xp.wins} برد / ${xp.losses} باخت) — امتیاز تجربه ${xp.xp}`
            : "در انتظار نخستین معامله برای شروع یادگیری…"
          : sig?.summaryFa ?? "در حال آماده‌سازی اولین تحلیل…";
        return (
          <motion.div
            key={a.key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.5, ease: "easeOut" }}
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 hover:bg-white/[0.045] transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="grid place-items-center rounded-xl size-9 shrink-0"
                style={{ background: `${a.accent}1a`, color: a.accent, border: `1px solid ${a.accent}30` }}
              >
                <a.icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-white/90 truncate">{a.nameFa}</span>
                  <span className="relative flex size-1.5 ms-auto shrink-0">
                    <span className="pulse-dot absolute inline-flex size-full rounded-full" style={{ background: a.accent }} />
                  </span>
                </div>
                <p className="text-[10.5px] text-white/40 leading-4 mt-0.5">{a.roleFa}</p>
              </div>
            </div>
            <p className="text-[11.5px] leading-5 text-white/70 mt-2.5 min-h-10 line-clamp-2">{summary}</p>
            <div className="flex items-center justify-between mt-2.5 gap-2">
              {isLearning ? (
                <span className="chip text-purple-300 border-purple-400/20 bg-purple-400/10">سطح {state?.learning.level ?? 1}</span>
              ) : (
                <SignalBadge signal={sig?.signal ?? null} />
              )}
              {conf != null && (
                <span className="text-[10px] text-white/35 num">اطمینان {(conf * 100).toFixed(0)}٪</span>
              )}
            </div>
            {!isLearning && weight != null && (
              <div className="mt-2">
                <div className="flex justify-between text-[9.5px] text-white/30 mb-1">
                  <span>نفوذ در تصمیم (یادگرفته‌شده)</span>
                  <span className="num">×{weight.toFixed(2)}</span>
                </div>
                <WeightBar value={weight} max={3} color={a.accent} />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
