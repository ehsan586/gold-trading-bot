"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogRow, timeAgo } from "./hooks";
import {
  Brain,
  CandlestickChart,
  Compass,
  GraduationCap,
  Scale,
  Satellite,
  LucideIcon,
} from "lucide-react";

const AGENT_STYLE: Record<string, { icon: LucideIcon; color: string; fa: string }> = {
  technical: { icon: CandlestickChart, color: "#f7b32b", fa: "تحلیل‌گر تکنیکال" },
  strategy: { icon: Compass, color: "#7c8cff", fa: "استراتژیست" },
  news: { icon: Satellite, color: "#38bdf8", fa: "دیده‌بان اخبار" },
  risk: { icon: Scale, color: "#fb7185", fa: "مدیر ریسک" },
  portfolio: { icon: Brain, color: "#34d399", fa: "مدیر پرتفوی" },
  learning: { icon: GraduationCap, color: "#c084fc", fa: "موتور یادگیری" },
};

const KIND_BADGE: Record<string, string> = {
  trade: "پیش‌نویس معامله",
  decision: "تصمیم",
  learn: "یادگیری",
  news: "خبر",
  risk: "ریسک",
  info: "اطلاع",
};

export default function ActivityFeed({ logs }: { logs: LogRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      className="feed-scroll h-[420px] overflow-y-auto ps-1 pe-2 space-y-2"
    >
      {logs.length === 0 && (
        <div className="text-center text-white/30 text-xs py-16">
          اتاق جنگ هنوز ساکت است — اولین جلسه‌ی شرکت به‌زودی برگزار می‌شود…
        </div>
      )}
      <AnimatePresence initial={false}>
        {logs.map((log) => {
          const st = AGENT_STYLE[log.agent] ?? AGENT_STYLE.portfolio;
          const Icon = st.icon;
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35 }}
              className="flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5"
              style={{ borderRight: `2px solid ${st.color}55` }}
            >
              <span
                className="grid place-items-center rounded-lg size-7 shrink-0 mt-0.5"
                style={{ background: `${st.color}14`, color: st.color }}
              >
                <Icon size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color: st.color }}>
                    {st.fa}
                  </span>
                  <span className="text-[9px] text-white/30 border border-white/10 rounded-full px-1.5 py-px">
                    {KIND_BADGE[log.kind] ?? log.kind}
                  </span>
                  <span className="text-[9.5px] text-white/25 ms-auto num shrink-0">{timeAgo(log.createdAt)}</span>
                </div>
                <p className="text-[11px] leading-5 text-white/65 mt-1 break-words">{log.messageFa}</p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
