"use client";

import { motion } from "framer-motion";
import { NewsRow, timeAgo } from "./hooks";
import { TrendingDown, TrendingUp, Minus, ExternalLink } from "lucide-react";

const CAT: Record<string, { fa: string; cls: string }> = {
  us: { fa: "آمریکا", cls: "text-sky-300 border-sky-400/25 bg-sky-400/10" },
  indonesia: { fa: "ایندونزی", cls: "text-red-300 border-red-400/25 bg-red-400/10" },
  world: { fa: "جهان", cls: "text-violet-300 border-violet-400/25 bg-violet-400/10" },
};

const IMPACT: Record<string, { fa: string; cls: string }> = {
  high: { fa: "پراثر", cls: "text-red-300 border-red-400/30 bg-red-400/15" },
  medium: { fa: "متوسط", cls: "text-amber-200 border-amber-400/25 bg-amber-400/10" },
  low: { fa: "کم‌اثر", cls: "text-white/40 border-white/10 bg-white/[0.04]" },
};

export default function NewsFeed({ news }: { news: NewsRow[] }) {
  return (
    <div className="space-y-2 max-h-[380px] overflow-y-auto ps-1 pe-2">
      {news.length === 0 && (
        <div className="text-center text-white/30 text-xs py-14">
          دیده‌بان در حال اسکن فیدهای خبری آمریکا، اندونزی و جهان است…
        </div>
      )}
      {news.map((n, i) => {
        const sent = n.sentiment ?? 0;
        const SentIcon = sent > 0.12 ? TrendingUp : sent < -0.12 ? TrendingDown : Minus;
        const sentColor = sent > 0.12 ? "#34d399" : sent < -0.12 ? "#f87171" : "#8a93a6";
        return (
          <motion.a
            key={n.id}
            href={n.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
            className="group flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 hover:border-white/[0.12] hover:bg-white/[0.045] transition-colors"
          >
            <span
              className="grid place-items-center rounded-lg size-7 shrink-0 mt-0.5"
              style={{ background: `${sentColor}14`, color: sentColor }}
            >
              <SentIcon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-5 text-white/80 group-hover:text-white transition-colors line-clamp-2 ltr text-right">
                {n.title}
              </p>
              <div className="flex items-center flex-wrap gap-1.5 mt-2">
                <span className={`chip ${CAT[n.category]?.cls ?? ""}`}>{CAT[n.category]?.fa ?? n.category}</span>
                <span className={`chip ${IMPACT[n.impact ?? "low"].cls}`}>{IMPACT[n.impact ?? "low"].fa}</span>
                <span className="chip num" style={{ color: sentColor }}>
                  طلا {sent >= 0 ? "+" : ""}{(sent * 100).toFixed(0)}
                </span>
                <span className="text-[9.5px] text-white/25 ms-auto inline-flex items-center gap-1">
                  {n.source} <ExternalLink size={9} className="opacity-0 group-hover:opacity-60 transition" />
                </span>
              </div>
              <div className="text-[9.5px] text-white/25 mt-1 num">{timeAgo(n.publishedAt)}</div>
            </div>
          </motion.a>
        );
      })}
    </div>
  );
}
