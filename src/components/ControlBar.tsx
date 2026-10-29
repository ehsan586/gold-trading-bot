"use client";

import { useState } from "react";
import { DashboardState, control } from "./hooks";
import { Package, Power, RotateCcw, SlidersHorizontal, Zap } from "lucide-react";

export default function ControlBar({
  state,
  onAction,
}: {
  state: DashboardState | null;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const s = state?.settings;

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      await control(body);
      onAction();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel p-3.5 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2 text-[12px] font-bold text-white/80">
        <SlidersHorizontal size={14} className="text-amber-300" />
        اتاق فرمان
      </div>

      {/* engine switch */}
      <button
        onClick={() => void run("engine", { action: "toggle_engine" })}
        disabled={busy !== null}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-[11.5px] font-bold border transition cursor-pointer disabled:opacity-50 ${
          s?.autoTrading
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
            : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
        }`}
      >
        <Power size={13} />
        {busy === "engine" ? "…" : s?.autoTrading ? "توقف موتور معاملات" : "روشن‌کردن موتور معاملات"}
      </button>

      {/* risk */}
      <label className="flex items-center gap-2 text-[10.5px] text-white/45">
        ریسک هر معامله
        <select
          value={s?.riskPct ?? 1}
          onChange={(e) => void run("params", { action: "set_params", riskPct: Number(e.target.value) })}
          className="rounded-lg bg-white/[0.06] border border-white/10 text-white/85 text-[11px] px-2 py-1.5 outline-none cursor-pointer num"
        >
          {[0.5, 1, 1.5, 2, 3].map((v) => (
            <option key={v} value={v} className="bg-[#12151d]">{v}٪</option>
          ))}
        </select>
      </label>

      {/* leverage cap */}
      <label className="flex items-center gap-2 text-[10.5px] text-white/45">
        سقف اهرم
        <select
          value={s?.maxLeverage ?? 20}
          onChange={(e) => void run("params", { action: "set_params", maxLeverage: Number(e.target.value) })}
          className="rounded-lg bg-white/[0.06] border border-white/10 text-white/85 text-[11px] px-2 py-1.5 outline-none cursor-pointer num"
        >
          {[5, 10, 20, 30, 50, 100].map((v) => (
            <option key={v} value={v} className="bg-[#12151d]">{v}x</option>
          ))}
        </select>
      </label>

      {/* threshold */}
      <label className="flex items-center gap-2 text-[10.5px] text-white/45">
        آستانه ورود
        <select
          value={s?.entryThreshold ?? 0.45}
          onChange={(e) => void run("params", { action: "set_params", entryThreshold: Number(e.target.value) })}
          className="rounded-lg bg-white/[0.06] border border-white/10 text-white/85 text-[11px] px-2 py-1.5 outline-none cursor-pointer num"
        >
          {[0.3, 0.4, 0.45, 0.55, 0.65].map((v) => (
            <option key={v} value={v} className="bg-[#12151d]">{v.toFixed(2)}</option>
          ))}
        </select>
      </label>

      <div className="ms-auto flex items-center gap-2">
        <a
          href="/api/installer"
          download="argus-installer.sh"
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold border border-sky-400/25 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20 transition"
        >
          <Package size={12} />
          نصب‌کننده تک‌فایلی
        </a>
        <a
          href="/api/launcher?f=bat"
          download="argus-open.bat"
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold border border-purple-400/25 bg-purple-400/10 text-purple-300 hover:bg-purple-400/20 transition"
        >
          <Zap size={12} />
          لانچر یک‌کلیکی ویندوز
        </a>
        {s?.killSwitchOn && (
          <button
            onClick={() => void run("ks", { action: "kill_switch_off" })}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20 transition cursor-pointer disabled:opacity-50"
          >
            <Zap size={12} />
            بازنشانی کلید اضطراری
          </button>
        )}
        <button
          onClick={() => {
            if (confirm("همه معاملات، وزن‌های یادگیری و تاریخچه پاک و بالانس به ۱۰۰,۰۰۰$ برمی‌گردد. مطمئنی؟")) {
              void run("reset", { action: "reset" });
            }
          }}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold border border-white/10 bg-white/[0.03] text-white/50 hover:text-red-300 hover:border-red-400/30 transition cursor-pointer disabled:opacity-50"
        >
          <RotateCcw size={12} />
          بازنشانی کامل صندوق
        </button>
      </div>
    </div>
  );
}
