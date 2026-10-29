"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

export function Panel({
  title,
  icon: Icon,
  accent = "#f7b32b",
  right,
  children,
  className = "",
  pad = true,
}: {
  title: string;
  icon: LucideIcon;
  accent?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="panel-header">
        <span
          className="grid place-items-center rounded-lg size-8 shrink-0"
          style={{ background: `${accent}1c`, color: accent, border: `1px solid ${accent}33` }}
        >
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <h2 className="text-[13px] font-bold tracking-tight text-white/90">{title}</h2>
        <div className="ms-auto flex items-center gap-2">{right}</div>
      </div>
      <div className={pad ? "p-4 pt-3" : ""}>{children}</div>
    </section>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "gold" | "blue";
}) {
  const tones: Record<string, string> = {
    neutral: "text-white/60 border-white/10 bg-white/[0.04]",
    good: "text-emerald-300 border-emerald-400/20 bg-emerald-400/10",
    bad: "text-red-300 border-red-400/20 bg-red-400/10",
    gold: "text-amber-200 border-amber-400/25 bg-amber-400/10",
    blue: "text-sky-300 border-sky-400/20 bg-sky-400/10",
  };
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Sparkline({
  data,
  width = 260,
  height = 56,
  stroke = "#f7b32b",
  fill = true,
  baseline,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  baseline?: number;
}) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="rounded-lg bg-white/[0.03]" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPts = `0,${height} ${pts} ${width},${height}`;
  const gid = React.useId();
  const baselineY =
    baseline != null && baseline >= min && baseline <= max
      ? height - ((baseline - min) / span) * (height - 6) - 3
      : null;
  return (
    <svg width={width} height={height} className="ltr block w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {fill && <polygon points={areaPts} fill={`url(#${gid})`} />}
      {baselineY != null && (
        <line x1="0" x2={width} y1={baselineY} y2={baselineY} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      )}
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function WeightBar({ value, max = 3, color = "#f7b32b" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}55, ${color})` }}
      />
    </div>
  );
}
